const express = require('express')
const dotenv = require('dotenv')
const { WebSocketServer } = require('ws')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt')
const obfuscator = require('javascript-obfuscator');
const clc = require('cli-color')
const readline = require("readline");
const { RateLimiterMemory } = require('rate-limiter-flexible')

dotenv.config()

const PORT = parseInt(process.env.PORT) || 8080
const WSPORT = parseInt(process.env.WS_PORT) || 8081

const app = express()
const wss = new WebSocketServer({port: WSPORT}, () => {
    console.log("Websocket listening on port " + WSPORT)
})

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 8
const JWT_KEY = process.env.JWT_KEY || "secret"

const DEBUG = process.env.DEBUG || true

const loginLimiter = new RateLimiterMemory({
    points: 10,
    duration: 60,
    blockDuration: 60
})

const signupLimiter = new RateLimiterMemory({
    points: 2,
    duration: 120,
    blockDuration: 60 * 60
})

// ===== Console Log Inject =====

function getLogPrefix() {
    return new Date().getDate() + '.' + new Date().getMonth() + '.' + new Date().getFullYear() + ' / ' + new Date().getHours() + ':' + new Date().getMinutes() + ':' + new Date().getSeconds();
}

const _oldConsoleLog = console.log
const _oldConsoleWarn = console.warn
const _oldConsoleError = console.error

console.log = function() {  
    var args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.blue.bold("[I]"));
    
    _oldConsoleLog.apply(console, args);
}

console.warn = function() {  
    var args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.yellow.bold("[W]"));

    for (var i = 1; i < args.length; i++) {
        args[i] = clc.yellow(args[i])
    }
    
    _oldConsoleWarn.apply(console, args);
}

console.error = function() {  
    var args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.red.bold("[E]"));

    for (var i = 1; i < args.length; i++) {
        args[i] = clc.red(args[i])
    }
    
    _oldConsoleError.apply(console, args);
}

// ==============================

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Checks authentication token.
 * @param {String} token 
 * @returns null if invalid token, token otherwise
 */
function checkAuth(token, ip = null) {
    var decodedtoken = null;
    try {
        decodedtoken = jwt.verify(token, JWT_KEY)
    } catch {
        return null;
    }

    if (decodedtoken.session == null) {
        return null;
    }

    if (userSessions[decodedtoken.session] == null) {
        return null;
    }

    if (ip != null) {
        if (userSessions[decodedtoken.session].ip != ip) {
            return null;
        }
    }

    return userSessions[decodedtoken.session].username
}

/**
 * Generates a JWT for authentication
 * @param {String} username Username of user
 * @param {String} ip IP of user
 * @param {String} expiresIn Expiry time, defualt to 1d
 * @returns A signed JWT
 */
function createAuthToken(username, ip, expiresIn = "1d") {
    const randomID = makeid(50)

    userSessions[randomID] = {
        username: username,
        ip: ip
    }

    return jwt.sign({session: randomID}, JWT_KEY, {expiresIn: expiresIn})
}

var userData = {}

if (!fs.existsSync("data/")) {
    fs.mkdirSync("data")
    console.warn("No old data folder found, creating new...")
}

if (fs.existsSync('data/userData.json')) {
    userData = JSON.parse(fs.readFileSync('data/userData.json').toString('utf-8'))
} else {
    fs.writeFileSync('data/userData.json', "{}")
    console.warn("No old userdata.json file found, creating new...")
}

var games = {}
var userSessions = {}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', 'src/public/html');

app.use(cookieParser())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.render('index')
})

app.get("/game", (req, res) => {
    if (!req.cookies.token) {
        res.redirect("/")
        return;
    }

    res.render('game')
})

app.get("/stylesheet.css", (req, res) => {
    res.send(fs.readFileSync("src/public/css/stylesheet.css"))
})

app.get("/index.js", (req, res) => {
    res.send(obfuscator.obfuscate(fs.readFileSync("src/public/javascript/index.js").toString()).getObfuscatedCode())
})

app.get("/game.js", (req, res) => {
    if (!req.cookies.token) {
        res.status(403).send("Unauthorized | No Authentication")
        return;
    }

    res.send(obfuscator.obfuscate(fs.readFileSync("src/public/javascript/game.js").toString()).getObfuscatedCode())
})

app.get("/login", (req, res) => {
    res.status("405")
    res.send("Invalid usage")
})

app.get("/register", (req, res) => {
    res.status("405")
    res.send("Invalid usage")
})

app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    const token = req.cookies.token;

    if (username == null && password == null) {
        const tokenAuthResult = checkAuth(token, req.ip);
        if (tokenAuthResult != null) {
            res.send(JSON.stringify({
                username: tokenAuthResult
            }))
        } else {
            loginLimiter.consume(req.ip)
            .then(() => {
                res.status(403)
                res.send("Invalid Token")
            })
            .catch((e) => {
                res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
            });
        }
    } else {
        if (userData[username] == null) {
            loginLimiter.consume(req.ip)
            .then(() => {
                res.status(403)
                res.send("Invalid username or password")
            })
            .catch((e) => {
                res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
            });
            return;
        }

        if (bcrypt.compareSync(password, userData[username].password)) {
            res.cookie("token", createAuthToken(username, req.ip), { maxAge: 1000 * 60 * 60 * 24 })
            res.send("Successful Login.")
        } else {
            loginLimiter.consume(req.ip)
            .then(() => {
                res.status(403)
                res.send("Invalid username or password")
            })
            .catch((e) => {
                res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
            });
        }
    }
})

app.post("/register", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    if (username == null || password == null) {
        res.status(400)
        res.send("Invalid request.")
        return;
    }

    if (userData[username] != null) {
        res.status(400)
        res.send("Username taken.")
        return;
    }

    if (username.length < 3 || username.length > 16) {
        res.status(400)
        res.send("Username length is less than 3 characters long or greater than 16 characters long")
        return;
    }

    if (password.length < 8) {
        res.status(400)
        res.send("Weak password, choose another. (Needs to be more than 8 characters long)")
        return;
    }

    signupLimiter.consume(req.ip)
    .then(() => {
        const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);
        userData[username] = {
            password: hashedPassword,
            pastGames: []
        }

        res.cookie("token", createAuthToken(username, req.ip), { maxAge: 1000 * 60 * 60 * 24 })
        res.send("Successful")

        fs.writeFileSync("data/userData.json", JSON.stringify(userData));
    })
    .catch((e) => {
        res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
    });
})

app.listen(PORT, () => {
    console.log("WebServer listening on port " + PORT)
})

if (DEBUG) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    
    rl.on("line", (input) => {
        const command = input.split(" ")[0]
        const args = input.split(" ").slice(1)
    
        switch (command) {
            case "stop":
                console.log("Closing down listeners")
                rl.close()
                console.log("Saving all files")
                fs.writeFileSync("data/userData.json", JSON.stringify(userData));
                console.log("Shutting down WebSocket connections")
                console.log("Shutting down Express server")
                console.log("Shutdown process completed.")
                process.exit()
            default:
                console.error("Not a valid command. Commands: [stop]")
        }
    })
}