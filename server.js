require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const qr = require("qr-image");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const fetch = require("node-fetch");
const path = require("path");
const cors = require("cors");

const app = express();
const PORT = 3000;
app.use(bodyParser.json());

app.use(cors());

// ✅ Connect to MongoDB
mongoose.connect("mongodb://127.0.0.1:27017/auth-system")
    .then(() => console.log("MongoDB Connected"))
    .catch(err => console.error("MongoDB connection error:", err));

// ✅ Define a Mongoose Model
const ItemSchema = new mongoose.Schema({
    name: String,
    description: String,
});
const Item = mongoose.model("Item", ItemSchema);

// ✅ CREATE (Add a new item)
app.post("/items", async (req, res) => {
    try {
        const newItem = new Item(req.body);
        await newItem.save();
        res.status(201).json(newItem);
    } catch (err) {
        res.status(500).json({ error: "Error creating item" });
    }
});

// ✅ READ (Get all items)
app.get("/items", async (req, res) => {
    try {
        const items = await Item.find();
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: "Error fetching items" });
    }
});

// ✅ UPDATE (Edit an item)
app.put("/items/:id", async (req, res) => {
    try {
        const updatedItem = await Item.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedItem);
    } catch (err) {
        res.status(500).json({ error: "Error updating item" });
    }
});

// ✅ DELETE (Remove an item)
app.delete("/items/:id", async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: "Item deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Error deleting item" });
    }
});

// BMI Route
app.post("/bmi", (req, res) => {
    const { weight, height } = req.body;

    if (!weight || !height) {
        return res.status(400).json({ error: "Please provide both weight and height" });
    }

    const bmi = (weight / (height * height)).toFixed(2);
    res.json({ bmi });
});

// Serve BMI page
app.get("/bmi", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "bmi.html"));
});

//weather
app.use(express.static("public")); // Serve HTML from public folder
app.use(express.json());

const OPENWEATHER_API_KEY = "9d3e681a50f5ea11f1e54b4c463f0d24"; // Replace with your API key

app.get("/weather", async (req, res) => {
    const city = req.query.city;
    if (!city) return res.status(400).json({ error: "City is required" });

    try {
        // Fetch weather data
        const weatherRes = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${OPENWEATHER_API_KEY}&units=metric`
        );
        const weatherData = await weatherRes.json();
        if (weatherData.cod !== 200) return res.status(400).json({ error: "City not found" });

        // Fetch air quality index (AQI)
        const { coord } = weatherData;
        const aqiRes = await fetch(
            `https://api.openweathermap.org/data/2.5/air_pollution?lat=${coord.lat}&lon=${coord.lon}&appid=${OPENWEATHER_API_KEY}`
        );
        const aqiData = await aqiRes.json();
        const aqi = aqiData.list[0].main.aqi; // AQI level (1-5)

        // Fetch country flag from another API
        const countryCode = weatherData.sys.country;
        const flagRes = await fetch(`https://restcountries.com/v3.1/alpha/${countryCode}`);
        const flagData = await flagRes.json();
        const flagUrl = flagData[0].flags.png;

        // Send data to frontend
        res.json({
            temperature: weatherData.main.temp,
            description: weatherData.weather[0].description,
            icon: `https://openweathermap.org/img/wn/${weatherData.weather[0].icon}.png`,
            coordinates: coord,
            feels_like: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            pressure: weatherData.main.pressure,
            wind_speed: weatherData.wind.speed,
            country: countryCode,
            aqi: aqi,
            flag: flagUrl
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Server error" });
    }
});



//send email
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: "rishatnurasyl77@gmail.com",  // Replace with your Gmail
        pass: "lwyq izmr vcve eusw"      // Use Google App Password here
    }
});

app.post("/sendEmail", async (req, res) => {
    const { email, subject, message } = req.body;

    try {
        await transporter.sendMail({
            from: "your-email@gmail.com",
            to: email,
            subject: subject,
            text: message
        });

        res.status(200).send("Email sent successfully");
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).send("Failed to send email");
    }
});

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(session({
    secret: "secretKey",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
}));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.log(err));

// User Schema
const UserSchema = new mongoose.Schema({
    username: String,
    password: String,
    createdAt: { type: Date, default: Date.now }
});


//qr-code
app.get("/generateQR", (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send("URL required");

    const qr_png = qr.imageSync(url, { type: "png" });
    res.setHeader("Content-Type", "image/png");
    res.send(qr_png);
});


const User = mongoose.model("User", UserSchema);

// Routes
app.get("/", (req, res) => {
    if (req.session.user) {
        res.redirect("/main");
    } else {
        res.sendFile(__dirname + "/public/login.html");
    }
});

app.get("/register.html", (req, res) => {
    res.sendFile(__dirname + "/public/register.html");
});

app.post("/register", async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ username, password: hashedPassword });
    await newUser.save();

    res.redirect("/");
});

app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.send("Invalid username or password");
    }

    req.session.user = user;
    res.redirect("/main");
});

app.get("/main", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/");
    }
    res.sendFile(__dirname + "/public/main.html");
});

app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// Start Server
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
