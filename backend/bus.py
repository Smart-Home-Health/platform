# bus.py
import asyncio
from typing import AsyncIterator, Any, Optional, Callable, Dict, Set, Type
from collections import defaultdict
import logging

logger = logging.getLogger("bus")

class EventBus:
    """Enhanced pub/sub bus with topic-based routing and typed event handling."""

    def __init__(self, maxsize: int = 1000):
        self._q: asyncio.Queue[Any] = asyncio.Queue(maxsize=maxsize)
        # Topic-based subscribers: topic -> set of queues
        self._topic_subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        # Type-based subscribers: event_type -> set of queues  
        self._type_subscribers: Dict[Type, Set[asyncio.Queue]] = defaultdict(set)
        # Global subscribers (get all events)
        self._global_subscribers: Set[asyncio.Queue] = set()
        self._running = True

    async def publish(self, event: Any, topic: Optional[str] = None) -> None:
        """
        Publish an event to the bus and to any topic/type-specific subscribers.
        
        Args:
            event: The event to publish
            topic: Optional topic for topic-based routing
        """
        try:
            # Put on main queue for global consumption (non-blocking; drop oldest if full)
            try:
                self._q.put_nowait(event)
            except asyncio.QueueFull:
                try:
                    self._q.get_nowait()
                except asyncio.QueueEmpty:
                    pass
                try:
                    self._q.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning("Main event queue full, dropping event")
            
            # Send to topic subscribers if topic specified
            if topic and topic in self._topic_subscribers:
                for sub_queue in list(self._topic_subscribers[topic]):
                    try:
                        sub_queue.put_nowait(event)
                    except asyncio.QueueFull:
                        logger.warning(f"Topic subscriber queue full for topic: {topic}")
                    except Exception as e:
                        logger.error(f"Error sending to topic subscriber: {e}")
            
            # Send to type-based subscribers
            event_type = type(event)
            if event_type in self._type_subscribers:
                for sub_queue in list(self._type_subscribers[event_type]):
                    try:
                        sub_queue.put_nowait(event)
                    except asyncio.QueueFull:
                        # Drop oldest event to make room for the latest
                        try:
                            sub_queue.get_nowait()
                        except asyncio.QueueEmpty:
                            pass
                        try:
                            sub_queue.put_nowait(event)
                        except asyncio.QueueFull:
                            logger.warning(f"Type subscriber queue still full for: {event_type}")
                    except Exception as e:
                        logger.error(f"Error sending to type subscriber: {e}")
            
            # Send to global subscribers
            for sub_queue in list(self._global_subscribers):
                try:
                    sub_queue.put_nowait(event)
                except asyncio.QueueFull:
                    logger.warning("Global subscriber queue full")
                except Exception as e:
                    logger.error(f"Error sending to global subscriber: {e}")
                    
        except Exception as e:
            logger.error(f"Error publishing event: {e}")

    async def subscribe(self) -> AsyncIterator[Any]:
        """Yield events forever from the main queue (global subscription)."""
        while self._running:
            try:
                evt = await self._q.get()
                yield evt
                self._q.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in global subscription: {e}")

    async def subscribe_to_topic(self, topic: str, maxsize: int = 500) -> AsyncIterator[Any]:
        """Subscribe to events published to a specific topic."""
        sub_queue = asyncio.Queue(maxsize=maxsize)
        self._topic_subscribers[topic].add(sub_queue)
        
        try:
            while self._running:
                try:
                    evt = await sub_queue.get()
                    yield evt
                    sub_queue.task_done()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in topic subscription for {topic}: {e}")
        finally:
            self._topic_subscribers[topic].discard(sub_queue)

    async def subscribe_to_type(self, event_type: Type, maxsize: int = 500) -> AsyncIterator[Any]:
        """Subscribe to events of a specific type."""
        sub_queue = asyncio.Queue(maxsize=maxsize)
        self._type_subscribers[event_type].add(sub_queue)
        
        try:
            while self._running:
                try:
                    evt = await sub_queue.get()
                    yield evt
                    sub_queue.task_done()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"Error in type subscription for {event_type}: {e}")
        finally:
            self._type_subscribers[event_type].discard(sub_queue)

    def create_topic_subscriber(self, topic: str, maxsize: int = 100) -> asyncio.Queue:
        """Create a queue-based subscriber for a specific topic."""
        sub_queue = asyncio.Queue(maxsize=maxsize)
        self._topic_subscribers[topic].add(sub_queue)
        return sub_queue

    def create_type_subscriber(self, event_type: Type, maxsize: int = 100) -> asyncio.Queue:
        """Create a queue-based subscriber for a specific event type."""
        sub_queue = asyncio.Queue(maxsize=maxsize)
        self._type_subscribers[event_type].add(sub_queue)
        return sub_queue

    def create_global_subscriber(self, maxsize: int = 100) -> asyncio.Queue:
        """Create a queue-based subscriber for all events."""
        sub_queue = asyncio.Queue(maxsize=maxsize)
        self._global_subscribers.add(sub_queue)
        return sub_queue

    def remove_subscriber(self, sub_queue: asyncio.Queue):
        """Remove a subscriber queue from all subscriptions."""
        # Remove from topic subscribers
        for topic_queues in self._topic_subscribers.values():
            topic_queues.discard(sub_queue)
        
        # Remove from type subscribers  
        for type_queues in self._type_subscribers.values():
            type_queues.discard(sub_queue)
            
        # Remove from global subscribers
        self._global_subscribers.discard(sub_queue)

    def shutdown(self):
        """Stop the event bus and clean up."""
        self._running = False
