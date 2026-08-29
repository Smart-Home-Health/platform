/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
// Square-crop and downscale a chosen photo on the device before upload. The
// server never resizes (no image library there), so this is what keeps a
// 12-megapixel portrait down to a 256px JPEG — and the canvas re-encode drops
// EXIF/GPS metadata on the way.

/** Centre square of a w×h image and the output edge (never upscaled). */
export function cropRect(width, height, target = 256) {
  const side = Math.max(1, Math.min(width, height));
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    out: Math.min(target, side),
  };
}

function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve({ img, url });
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as an image')); };
    img.src = url;
  });
}

/** @returns {Promise<File>} a `${size}`px square JPEG */
export async function cropToSquareJpeg(file, { size = 256, quality = 0.85 } = {}) {
  const { img, url } = await loadImage(file);
  try {
    const { sx, sy, side, out } = cropRect(img.naturalWidth, img.naturalHeight, size);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, out, out);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not encode the photo');
    return new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(url);
  }
}
