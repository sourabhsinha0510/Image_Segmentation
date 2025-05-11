require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const twilio = require("twilio");


const PORT = 8000;
const app = express();
// Twilio setup

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

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
app.post("/register", uploadImage.single("image"), async (req, res) => {
  try {
    const { username, password, selectedSegments } = req.body;

    // Check if username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).send("Username is already taken.");
    }

    if (!req.file) return res.status(400).send("No image uploaded.");
    if (!selectedSegments) return res.status(400).send("No segments selected.");

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      password: hashedPassword,
      imageSegments: JSON.parse(selectedSegments),
      imagePath: req.file.path,
    });

    await newUser.save();
    res.redirect("/login");
  } catch (err) {
    console.error("Error in /register:", err);
    res.status(500).send("Registration failed.");
  }
});

// Login Route
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username });
    if (!user) return res.send("Invalid credentials. <a href='/login'>Try again</a>");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Invalid credentials. <a href='/login'>Try again</a>");
    
    const inputSegments = JSON.parse(selectedSegments);
    const storedSegments = user.imageSegments;

    const segmentsMatch =
      inputSegments.length === storedSegments.length &&
      inputSegments.every((seg, index) => seg === storedSegments[index]);


    req.session.username = user.username;
    res.redirect("/verify");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});




// Updated: Fetch Actual User Image Path API
app.get('/api/user-image', async (req, res) => {
  const username = req.query.username;

  try {
    const user = await User.findOne({ username });
    if (!user || !user.imagePath) {
      return res.status(404).json({ error: "Image not found" });
    }

    const imagePathRelative = "/" + user.imagePath.replace(/\\/g, "/"); // Handle Windows slashes
    console.log("Image path returned:", imagePathRelative);

    res.json({ imagePath: imagePathRelative });
  } catch (err) {
    console.error("Error in /api/user-image:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Serve image/document folders
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// OTP verification page
app.get("/verify", (req, res) => {
  if (!req.session.username) return res.redirect("/login");
  res.sendFile(path.join(__dirname, "views", "verify.html"));
});

// Send OTP API
app.post("/send-otp", async (req, res) => {
  const { mobile } = req.body;
  if (!req.session.username) return res.status(401).json({ success: false, message: "Unauthorized" });
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
  const otp = Math.floor(100000 + Math.random() * 900000);
  req.session.otp = otp;

  try {
    await client.messages.create({
      body: `Your OTP for PicPass is ${otp} do not share it `,
      from: twilioPhone,
      to: mobile,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Twilio error:", err.message);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
});

// Verify OTP
app.post("/verify", (req, res) => {
  const userOtp = req.body.otp;
  if (!req.session.otp) {
    return res.send("Session expired. <a href='/login'>Login again</a>");
  }

  if (parseInt(userOtp) === req.session.otp) {
    req.session.isAuthenticated = true;
    delete req.session.otp;
    res.redirect("/dashboard");
  } else {
    res.send("Invalid OTP. <a href='/verify'>Try again</a>");
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

// Secure document access
app.use('/uploads/documents', (req, res, next) => {
  if (!req.session.username) {
    return res.status(401).send("Unauthorized");
  }
  next();
});

// Start Server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
