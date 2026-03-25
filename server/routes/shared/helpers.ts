import { join } from 'path';
import { writeFileSync } from 'fs';
import { characterImagesDir } from './multer-configs';

/**
 * Saves a base64-encoded image to the character images directory and returns
 * the public URL path for the saved file.
 */
export function saveBase64Image(base64Data: string, prefix: string): string {
  const timestamp = Date.now();
  const randomId = Math.random().toString(36).substring(2, 8);
  const filename = `${prefix}_${timestamp}_${randomId}.png`;
  const filepath = join(characterImagesDir, filename);

  const buffer = Buffer.from(base64Data, 'base64');
  writeFileSync(filepath, buffer);

  return `/attached_assets/character_images/${filename}`;
}
