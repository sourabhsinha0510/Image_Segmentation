require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const PORT = 3000;
const app = express();

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(
  session({
    secret: "securePasswordSystem",
    resave: false,
    saveUninitialized: false,
  })
);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: String,
  password: String,
  imageSegments: [String],
  imagePath: String,
  documents: [
    {
      name: String,
      path: String,
    },
  ],
});
const User = mongoose.model("User", userSchema);

// Multer configuration for images
const imageStorage = multer.diskStorage({
  destination: "./uploads/images",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const uploadImage = multer({ storage: imageStorage });

// Multer configuration for documents
const documentStorage = multer.diskStorage({
  destination: "./uploads/documents",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const uploadDocument = multer({ storage: documentStorage });

// Routes
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "/views/index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "/views/register.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "/views/login.html")));

// Register Route
// Register Route
app.post("/register", uploadImage.single("image"), async (req, res) => {
  try {
    const { username, password, selectedSegments } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).send("Username is already taken.");
    }

    // Ensure image and segments are provided
    if (!req.file) return res.status(400).send("No image uploaded.");
    if (!selectedSegments) return res.status(400).send("No segments selected.");

    // Hash the password before saving
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      imageSegments: JSON.parse(selectedSegments),
      imagePath: req.file.path,
    });

    // Save the new user to the database
    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Error in /register:", err);
    res.status(500).send("Registration failed.");
  }
});


// Login Route
app.post("/login", uploadImage.single("image"), async (req, res) => {
  try {
    const { username, password, selectedSegments } = req.body;

    if (!selectedSegments) return res.status(400).send("No segments selected.");
    const user = await User.findOne({ username });
    if (!user) return res.status(400).send("User not found.");

    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) return res.status(400).send("Incorrect password.");

    if (JSON.stringify(user.imageSegments.sort()) !== JSON.stringify(JSON.parse(selectedSegments).sort())) {
      return res.status(400).send("Incorrect image segments.");
    }

    req.session.username = username;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error in /login:", err);
    res.status(500).send("Login failed.");
  }
});

// Dashboard Route
app.get("/dashboard", (req, res) => {
  if (!req.session.username) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "/views/dashboard.html"));
});

// Upload Document Route
app.post("/upload-document", uploadDocument.single("document"), async (req, res) => {
  if (!req.session.username) return res.status(401).send("Unauthorized.");
  if (!req.file) return res.status(400).send("No document uploaded.");

  try {
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.status(404).send("User not found.");

    user.documents.push({ name: req.file.originalname, path: req.file.path });
    await user.save();

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Error uploading document:", err);
    res.status(500).send("Document upload failed.");
  }
});

// Fetch Documents API
app.get("/api/documents", async (req, res) => {
  if (!req.session.username) return res.status(401).send("Unauthorized.");

  try {
    const user = await User.findOne({ username: req.session.username });
    if (!user) return res.status(404).send("User not found.");

    res.json(user.documents);
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).send("Error fetching documents.");
  }
});

// Serve Static Files (Documents)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Secure document access (Optional: Only authenticated users can view documents)
app.use('/uploads/documents', (req, res, next) => {
  if (!req.session.username) {
    return res.status(401).send("Unauthorized");
  }
  next();
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
