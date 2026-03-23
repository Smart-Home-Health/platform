"""
Integration registry for discovering and managing available integrations.
"""
from typing import Dict, Optional, List, Type
from .base import BaseIntegration


class IntegrationRegistry:
    """
    Central registry for all available integrations.
    
    Integrations register themselves at import time using the @register decorator
    or by calling register() directly. The registry provides lookup and listing
    capabilities for the API layer.
    
    Usage:
        from integrations.registry import registry
        
        # Register an integration
        registry.register(MyIntegration)
        
        # Get an integration class by slug
        integration_class = registry.get("withings")
        
        # List all available integrations
        for slug in registry.list_slugs():
            print(slug)
    """
    
    def __init__(self):
        self._integrations: Dict[str, Type[BaseIntegration]] = {}
    
    def register(self, integration_class: Type[BaseIntegration]) -> Type[BaseIntegration]:
        """
        Register an integration class.
        
        Can be used as a decorator:
            @registry.register
            class MyIntegration(BaseIntegration):
                ...
        
        Or called directly:
            registry.register(MyIntegration)
        
        Args:
            integration_class: The integration class to register
            
        Returns:
            The same class (for decorator usage)
            
        Raises:
            ValueError: If slug is empty or already registered
        """
        slug = integration_class.slug
        
        if not slug:
            raise ValueError(f"Integration {integration_class.__name__} has no slug defined")
        
        if slug in self._integrations:
            # Allow re-registration of same class (for hot reload)
            if self._integrations[slug] != integration_class:
                raise ValueError(f"Integration slug '{slug}' is already registered")
        
        self._integrations[slug] = integration_class
        return integration_class
    
    def get(self, slug: str) -> Optional[Type[BaseIntegration]]:
        """
        Get an integration class by its slug.
        
        Args:
            slug: The integration's URL-safe identifier
            
        Returns:
            The integration class or None if not found
        """
        return self._integrations.get(slug)
    
    def list_slugs(self) -> List[str]:
        """
        List all registered integration slugs.
        
        Returns:
            List of registered slug strings
        """
        return list(self._integrations.keys())
    
    def list_all(self) -> List[Type[BaseIntegration]]:
        """
        List all registered integration classes.
        
        Returns:
            List of integration classes
        """
        return list(self._integrations.values())
    
    def get_integration_info(self, slug: str) -> Optional[Dict]:
        """
        Get metadata about an integration.
        
        Args:
            slug: The integration's slug
            
        Returns:
            Dict with integration info or None if not found
        """
        integration_class = self.get(slug)
        if not integration_class:
            return None
            
        return {
            'slug': integration_class.slug,
            'name': integration_class.name,
            'description': integration_class.description,
            'auth_type': integration_class.auth_type,
            'supported_vitals': integration_class.supported_vitals,
            'config_schema': integration_class.get_config_schema(),
        }
    
    def list_all_info(self) -> List[Dict]:
        """
        Get metadata for all registered integrations.
        
        Returns:
            List of integration info dicts
        """
        return [
            self.get_integration_info(slug) 
            for slug in self.list_slugs()
        ]


# Global registry instance
registry = IntegrationRegistry()


def register(integration_class: Type[BaseIntegration]) -> Type[BaseIntegration]:
    """
    Decorator to register an integration with the global registry.
    
    Usage:
        @register
        class MyIntegration(BaseIntegration):
            slug = "my_integration"
            ...
    """
    return registry.register(integration_class)


def get_integration(slug: str) -> Optional[Type[BaseIntegration]]:
    """
    Convenience function to get an integration from the global registry.
    
    Args:
        slug: The integration's slug
        
    Returns:
        The integration class or None
    """
    return registry.get(slug)
