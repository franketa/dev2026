const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Data directory
const DATA_DIR = process.env.DATA_DIR || './data';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const PROPERTIES_FILE = path.join(DATA_DIR, 'properties.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Initialize properties file if not exists
if (!fs.existsSync(PROPERTIES_FILE)) {
  fs.writeFileSync(PROPERTIES_FILE, JSON.stringify([], null, 2));
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve uploaded images
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer config for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Helper functions
function readProperties() {
  try {
    const data = fs.readFileSync(PROPERTIES_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading properties:', error);
    return [];
  }
}

function writeProperties(properties) {
  try {
    fs.writeFileSync(PROPERTIES_FILE, JSON.stringify(properties, null, 2));
    return true;
  } catch (error) {
    console.error('Error writing properties:', error);
    return false;
  }
}

function getNextId(properties) {
  if (properties.length === 0) return 1;
  return Math.max(...properties.map(p => p.id)) + 1;
}

function saveBase64Image(base64String) {
  if (!base64String || !base64String.startsWith('data:image')) {
    return base64String; // Return as-is if not base64
  }

  try {
    const matches = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return base64String;

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const filename = `${uuidv4()}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    return filename;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    return null;
  }
}

function deleteImage(filename) {
  if (!filename || filename.startsWith('data:') || filename.startsWith('http')) return;

  const filepath = path.join(UPLOADS_DIR, filename);
  if (fs.existsSync(filepath)) {
    try {
      fs.unlinkSync(filepath);
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }
}

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET all properties
app.get('/api/properties', (req, res) => {
  try {
    const properties = readProperties();
    res.json(properties);
  } catch (error) {
    res.status(500).json({ error: 'Error loading properties' });
  }
});

// GET single property
app.get('/api/properties/:id', (req, res) => {
  try {
    const properties = readProperties();
    const property = properties.find(p => p.id === parseInt(req.params.id));
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }
    res.json(property);
  } catch (error) {
    res.status(500).json({ error: 'Error loading property' });
  }
});

// POST create property
app.post('/api/properties', (req, res) => {
  try {
    const properties = readProperties();
    const data = req.body;

    // Convert base64 images to files
    if (data.coverImage && data.coverImage.startsWith('data:')) {
      data.coverImage = saveBase64Image(data.coverImage);
    }

    if (data.images && Array.isArray(data.images)) {
      data.images = data.images.map(img => {
        if (img && img.startsWith('data:')) {
          return saveBase64Image(img);
        }
        return img;
      }).filter(Boolean);
    }

    const property = {
      id: getNextId(properties),
      ...data,
      createdAt: new Date().toISOString().split('T')[0]
    };

    properties.unshift(property);

    if (writeProperties(properties)) {
      res.status(201).json(property);
    } else {
      res.status(500).json({ error: 'Error saving property' });
    }
  } catch (error) {
    console.error('Error creating property:', error);
    res.status(500).json({ error: 'Error creating property' });
  }
});

// PUT update property
app.put('/api/properties/:id', (req, res) => {
  try {
    const properties = readProperties();
    const id = parseInt(req.params.id);
    const index = properties.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const oldProperty = properties[index];
    const data = req.body;

    // Handle cover image
    if (data.coverImage && data.coverImage.startsWith('data:')) {
      // Delete old cover if it's a file
      if (oldProperty.coverImage && !oldProperty.coverImage.startsWith('data:')) {
        deleteImage(oldProperty.coverImage);
      }
      data.coverImage = saveBase64Image(data.coverImage);
    }

    // Handle gallery images
    if (data.images && Array.isArray(data.images)) {
      // Find images to delete (old images not in new array)
      if (oldProperty.images && Array.isArray(oldProperty.images)) {
        oldProperty.images.forEach(oldImg => {
          if (!oldImg.startsWith('data:') && !data.images.includes(oldImg)) {
            deleteImage(oldImg);
          }
        });
      }

      // Convert new base64 images to files
      data.images = data.images.map(img => {
        if (img && img.startsWith('data:')) {
          return saveBase64Image(img);
        }
        return img;
      }).filter(Boolean);
    }

    properties[index] = { ...oldProperty, ...data };

    if (writeProperties(properties)) {
      res.json(properties[index]);
    } else {
      res.status(500).json({ error: 'Error updating property' });
    }
  } catch (error) {
    console.error('Error updating property:', error);
    res.status(500).json({ error: 'Error updating property' });
  }
});

// DELETE property
app.delete('/api/properties/:id', (req, res) => {
  try {
    const properties = readProperties();
    const id = parseInt(req.params.id);
    const index = properties.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const property = properties[index];

    // Delete associated images
    if (property.coverImage && !property.coverImage.startsWith('data:')) {
      deleteImage(property.coverImage);
    }
    if (property.images && Array.isArray(property.images)) {
      property.images.forEach(img => {
        if (!img.startsWith('data:')) {
          deleteImage(img);
        }
      });
    }

    properties.splice(index, 1);

    if (writeProperties(properties)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Error deleting property' });
    }
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ error: 'Error deleting property' });
  }
});

// Upload image endpoint (for direct file upload)
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image provided' });
  }
  res.json({ filename: req.file.filename });
});

// Upload multiple images
app.post('/api/upload/multiple', upload.array('images', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }
  res.json({ filenames: req.files.map(f => f.filename) });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API running on port ${PORT}`);
  console.log(`Data directory: ${path.resolve(DATA_DIR)}`);
  console.log(`Uploads directory: ${path.resolve(UPLOADS_DIR)}`);
});
