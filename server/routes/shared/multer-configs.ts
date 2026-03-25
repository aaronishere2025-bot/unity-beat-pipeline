import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import multer from 'multer';

// ── Character Images ────────────────────────────────────────────────────────

export const characterImagesDir = join(process.cwd(), 'attached_assets', 'character_images');

if (!existsSync(characterImagesDir)) {
  mkdirSync(characterImagesDir, { recursive: true });
}

const characterImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, characterImagesDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    cb(null, `character_${timestamp}_${randomId}.${ext}`);
  },
});

export const uploadCharacterImage = multer({
  storage: characterImageStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, JPEG, PNG, and WEBP are allowed.'));
    }
  },
});

// ── Reference Images (VEO 3.1) ──────────────────────────────────────────────

export const referenceImagesDir = join(process.cwd(), 'attached_assets', 'reference_images');

if (!existsSync(referenceImagesDir)) {
  mkdirSync(referenceImagesDir, { recursive: true });
}

const referenceImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, referenceImagesDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    cb(null, `ref_${timestamp}_${randomId}.${ext}`);
  },
});

export const uploadReferenceImage = multer({
  storage: referenceImageStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per image
  },
  fileFilter: (req, file, cb) => {
    // VEO 3.1 only supports JPEG and PNG for reference images
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. VEO 3.1 only accepts JPEG and PNG images.'));
    }
  },
});

// ── Music Uploads ───────────────────────────────────────────────────────────

export const musicDir = join(process.cwd(), 'attached_assets', 'music');

if (!existsSync(musicDir)) {
  mkdirSync(musicDir, { recursive: true });
}

const musicStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, musicDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'mp3';
    cb(null, `music_${timestamp}_${randomId}.${ext}`);
  },
});

export const uploadMusic = multer({
  storage: musicStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/ogg', 'audio/mp4'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP3, WAV, M4A, and OGG are allowed.'));
    }
  },
});
