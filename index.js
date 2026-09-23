const express = require("express");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// USSD route
app.post("/ussd", (req, res) => {
    const { text } = req.body;
    console.log(req.body)
    let response = "";

    if (text === "") {
        response = "CON Welcome to my USSD App\n1. My Account\n2. Exit";
    } else if (text === "1") {
        response = "END Your account is active";
    } else {
        response = "END Goodbye";
    }

    res.set("Content-Type", "text/plain");
    res.send(response);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));