const express = require('express')
const dotenv = require('dotenv')
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt')
const obfuscator = require('javascript-obfuscator');
const clc = require('cli-color')
const readline = require("readline");
const compression = require('compression')
const { RateLimiterMemory } = require('rate-limiter-flexible')
const { createServer } = require("http");
const { Server } = require("socket.io");
const { instrument } = require("@socket.io/admin-ui")

dotenv.config()

const PORT = parseInt(process.env.PORT) || 8080

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 8
const JWT_KEY = process.env.JWT_KEY || "secret"

const DOMAIN_LOCK = JSON.parse(process.env.DOMAIN_LOCK || "[\"localhost\"]")
const DOMAIN_LOCK_REDIRECT = process.env.DOMAIN_LOCK_REDIRECT || "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

if (fs.existsSync("src/settings.json")) {
    var GAME_ARGS = JSON.parse(fs.readFileSync("src/settings.json", "utf8"))
} else {
    console.error("Settings file not found, creating.")
    fs.copyFileSync("src/settings_sample.json", "src/settings.json")
    process.exit()
}

const DEBUG = process.env.DEBUG == null? true : (process.env.DEBUG == "1")

const INIT_ARGS = process.argv.slice(2);

const OBFUSCATOR_SETTINGS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,
    debugProtectionInterval: 0,
    disableConsoleOutput: true,
    domainLock: DOMAIN_LOCK, //Lock to domain
    domainLockRedirectUrl: DOMAIN_LOCK_REDIRECT, //Redirect to whatever its set to
    identifierNamesGenerator: 'hexadecimal',
    log: false,
    numbersToExpressions: true,
    renameGlobals: false,
    selfDefending: true,
    simplify: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    stringArray: true,
    stringArrayCallsTransform: true,
    stringArrayCallsTransformThreshold: 0.75,
    stringArrayEncoding: ['base64'],
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false
}

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

const lobbyLimiter = new RateLimiterMemory({
    points: 5,
    duration: 30,
    blockDuration: 60 * 5 //300 seconds | 5 minutes
})

const refreshLimiter = new RateLimiterMemory({
    points: 10,
    duration: 60,
    blockDuration: 60
})

const app = express()
const httpServer = createServer(app);
const io = new Server(httpServer);
instrument(io, {
    auth: {
        type: "basic",
        username: process.env.ADMIN_USERNAME || "admin",
        password: process.env.ADMIN_PASS || "$2b$10$MpvhUG3v5/JOn/aro9TnBuRB8HYR/5nSVqTL1ZOyjoUJhJPyqeBZK" // "admin"
    }
})

// ===== Console Log Inject =====

function getLogPrefix() {
    return new Date().getDate() + '.' + new Date().getMonth() + '.' + new Date().getFullYear() + ' / ' + new Date().getHours() + ':' + new Date().getMinutes() + ':' + new Date().getSeconds();
}

const _oldConsoleLog = console.log
const _oldConsoleWarn = console.warn
const _oldConsoleError = console.error

console.log = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.blue.bold("[I]"));
    
    _oldConsoleLog.apply(console, args);
}

console.warn = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.yellow.bold("[W]"));

    for (let i = 1; i < args.length; i++) {
        args[i] = clc.yellow(args[i])
    }
    
    _oldConsoleWarn.apply(console, args);
}

console.error = function() {  
    let args = Array.from(arguments); // ES5
    args.unshift("(" + clc.italic(getLogPrefix()) + ") " + clc.red.bold("[E]"));

    for (let i = 1; i < args.length; i++) {
        args[i] = clc.red(args[i])
    }
    
    _oldConsoleError.apply(console, args);
}

// ==============================

function makeid(length) {
    let result = '';
    let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

function rand(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Checks authentication token.
 * @param {String} token 
 * @returns null if invalid token, username otherwise
 */
function checkAuth(token, ip = null) {
    let decodedtoken = null;
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

    if (userSessions[decodedtoken.session].expiry < Date.now()) {
        delete userSessions[decodedtoken.session];
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
function createAuthToken(username, ip, expiresIn = 60 * 60 * 24) {
    const randomID = makeid(64)

    userSessions[randomID] = {
        username: username,
        ip: ip,
        expiry: Date.now() + (expiresIn * 1000)
    }

    return jwt.sign({session: randomID}, JWT_KEY, {expiresIn: expiresIn})
}

/**
 * Checks authentication for administrator portal
 * @param {Express.Request} req Request
 * @returns Wether or not they are permitted to access the portal.
 */
function checkAdminAuth(req) {
    return req.cookies.token && checkAuth(req.cookies.token) != null && userData[checkAuth(req.cookies.token)].admin
}

function calculateDelta(x1, y1, x2, y2, speed) {
    if ((x2 - x1) == 0) {
        return {
            dx: 0,
            dy: 0
        }
    }

    const angle = Math.atan((y2 - y1) / (x2 - x1));

    const deltaX = speed * Math.cos(angle);
    const deltaY = speed * Math.sin(angle);

    return {
        dx: ((x2 - x1) < 0? -1:1) * deltaX,
        dy: ((x2 - x1) < 0? -1:1) * deltaY
    }
}

function getGameObject() {
    return {
        players: {},
        bullets: [],
        powerups: [],
        timeout: 0,
        nextpoweruptime: 0
    }
}

function sterilizeGame(game) {
    let result = getGameObject()

    const keys = Object.keys(game.players)
    
    let i;

    for (i = 0; i < keys.length; i++) {
        const player = game.players[keys[i]];

        result.players[keys[i]] = {
            health: player.health,
            buffs: (Object.keys(player.buffs).includes("speed")? {
                speed: 0
            }:{}),
            position: player.position,
            movement: player.movement,
            username: player.username,
            firecd: player.firecd
        }
    }

    for (i = 0; i < game.bullets.length; i++) {
        const bullet = game.bullets[i]

        result.bullets.push({
            x: bullet.x,
            y: bullet.y,
            dx: bullet.dx,
            dy: bullet.dy
        })
    }

    for (i = 0; i < game.powerups.length; i++) {
        const powerup = game.powerups[i]

        result.powerups.push({
            position: powerup.position
        })
    }

    return result;
}

function createACProfile(id) {
    anticheat.players[id] = {
        checkVls: {},
        data: {},
        packetSpam: {
            packets: 1,
            nextReset: Date.now() + 1000
        }
    }

    return anticheat.players[id]
}

function violate(id, checkName, times = 1, disconnect = true) {
    if (anticheat.players[id]) {
        if (anticheat.players[id].checkVls[checkName]) {
            anticheat.players[id].checkVls[checkName] += times;
        } else {
            anticheat.players[id].checkVls[checkName] = times
        }
    } else {
        createACProfile(id)

        anticheat.players[id].checkVls[checkName] += times
    }

    if (anticheat.players[id].checkVls[checkName] > GAME_ARGS.ANTICHEAT.MAX_VLS && disconnect) {
        io.fetchSockets().then(sockets => {
            const socket = sockets.find(x => x.id == id)
            if (socket) {
                console.warn(clc.bold.red("[ANTICHEAT]") + " " + clc.cyan(id) + clc.white(" was disconnected due to ANTICHEAT INFRACTION"))

                socket.emit("error", "Anticheat Disconnect")
                socket.disconnect(true)
            }
        })
    }

    if (anticheat.players[id].checkVls[checkName] % GAME_ARGS.ANTICHEAT.DISPLAY_EVERY == 0) {
        console.warn(clc.bold.red("[ANTICHEAT]") + " " + clc.cyan(id) + clc.white(" violated ") + clc.cyan(checkName) + " (x" + anticheat.players[id].checkVls[checkName] + ")")
    }
}

function isCloseToLine(obj, pos, range, bound) {
    // Calculate the end point of the line segment
    const endX = obj.x + range;
    const endY = obj.y + (range * obj.slope);
  
    // Calculate the distance from the line segment to the point
    const distance = distanceFromPointToLine(pos.x, pos.y, obj.x, obj.y, endX, endY);

    // Check if the distance is less than the bounding box value
    return distance < bound;
}

// Utility function to calculate the distance from a point to a line segment
function distanceFromPointToLine(x, y, x1, y1, x2, y2) {
    const a = x - x1;
    const b = y - y1;
    const c = x2 - x1;
    const d = y2 - y1;

    const dot = a * c + b * d;
    const lenSq = c * c + d * d;
    const param = (lenSq !== 0) ? dot / lenSq : 0;

    let xx, yy;

    if (param < 0) {
        xx = x1;
        yy = y1;
    } else if (param > 1) {
        xx = x2;
        yy = y2;
    } else {
        xx = x1 + param * c;
        yy = y1 + param * d;
    }

    const dx = x - xx;
    const dy = y - yy;
    return Math.sqrt(dx * dx + dy * dy);
}

function getBulletDamage() {
    return Math.floor(Math.random() * (GAME_ARGS.BULLET_DAMAGE.MAX - GAME_ARGS.BULLET_DAMAGE.MIN + 1)) + GAME_ARGS.BULLET_DAMAGE.MIN
}

// ==============================

// Javascript obfuscation
if (!DEBUG) {
    console.log("Beginning obfuscation...")
    const START_OBFUSCATION_TIME = Date.now()
    
    const javascript_directory = fs.readdirSync("src/public/javascript")
    
    if (fs.existsSync("src/public/javascript/cache")) {
        console.warn("Removing existing javascript cache folder...")
        fs.rmSync("src/public/javascript/cache", {
            recursive: true,
            force: true
        })
    }
    fs.mkdirSync("src/public/javascript/cache")
    
    for (let dir_js = 0; dir_js < javascript_directory.length; dir_js++) { //Long variable name to not interfere with other variables
        const fileName = javascript_directory[dir_js]
    
        if (!fileName.endsWith(".js")) continue;
    
        const obfuscated = obfuscator.obfuscate(fs.readFileSync("src/public/javascript/" + fileName).toString(), OBFUSCATOR_SETTINGS).getObfuscatedCode()
        fs.writeFileSync("src/public/javascript/cache/" + fileName, obfuscated)
    
        console.log("Obfuscated " + fileName + " successfully")
    }
    
    console.log("Obfuscation completed in " + (Date.now() - START_OBFUSCATION_TIME) + "ms.")
} else {
    console.warn("No obfuscation due to not having DEBUG=0 set in .env!")
}

let userData = {}

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

let games = {}
let anticheat = {
    players: {},
    chat: {}
}

let userSessions = {}

app.disable('x-powered-by');
app.set('view engine', 'ejs');
app.set('views', 'src/public/html');

app.use(cookieParser())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(compression())

app.use(express.static("src/public/css"))

app.use(express.static("src/public/javascript/no-obfuscate"))

app.use(express.static("src/public/assets"))

app.use(express.static("src/public/media/images"))
app.use(express.static("src/public/media/sound"))

app.get("/", (req, res) => {
    res.render('index')
})

app.get("/game", (req, res) => {
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
        res.redirect("/")
        return;
    }

    res.render('game')
})

app.get("*.js", (req, res) => {
    const p = path.join(__dirname, "/public/javascript", (DEBUG? "":"cache/") + req.path.substring(1)).normalize()

    // check if its still within the javascript directory
    if (!p.startsWith(path.join(__dirname, "/public/javascript", (DEBUG? "":"cache/")).normalize())) {
        res.status(403).send("Forbidden")
        return;
    }

    if (fs.existsSync(p)) {
        res.header("Content-Type", "text/javascript").send(fs.readFileSync(p).toString())
    } else {
        res.status(404).send("404 | Resource Not Found")
    }
})

app.get("/login", (req, res) => {
    res.redirect("/")
})

app.get("/register", (req, res) => {
    res.redirect("/")
})

app.get("/logout", (req, res) => {
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
        res.redirect("/")
        return;
    }

    res.cookie("token", "", { maxAge: 0 })
    res.redirect("/")
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
    const username = req.body.username.trim();
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

    if (/\W/gm.test(username)) {
        res.status(400)
        res.send("Username contains invalid characters")
        return;
    }

    signupLimiter.consume(req.ip)
    .then(() => {
        const hashedPassword = bcrypt.hashSync(password, SALT_ROUNDS);
        userData[username] = {
            password: hashedPassword,
            stats: {}
        }

        res.cookie("token", createAuthToken(username, req.ip), { maxAge: 1000 * 60 * 60 * 24 })
        res.send("Successful")

        fs.writeFileSync("data/userData.json", JSON.stringify(userData));
    })
    .catch((e) => {
        res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
    });
})

app.route("/api/lobby")
    .get((req, res) => {
        if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
            res.status(403).send("Unauthorized | No Authentication")
            return;
        }

        if (req.query.id == null) {
            res.status(400).send("Invalid Request | Missing query ID")
            return;
        }

        if (games[req.query.id] == null) {
            res.status(404).send("Game not found | " + req.query.id)
            return;
        }

        res.send("OK")
    })
    .post((req, res) => {
        if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
            res.status(403).send("Unauthorized | No Authentication")
            return;
        }

        lobbyLimiter.consume(req.ip)
        .then(() => {
            const gameid = makeid(8)

            games[gameid] = getGameObject()
    
            console.log("Created game " + gameid)
            
            res.send(gameid)
        })
        .catch((e) => {
            res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
        });
    })

app.get("/api/publicGames", (req, res) => {
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
        res.status(403).send("Unauthorized | No Authentication")
        return;
    }

    refreshLimiter.consume(req.ip).then(() => {
        let gameList = [];
    
        for (const element of Object.keys(games)) {
            if (element.startsWith("public_")) {
                gameList.push({
                    id: element,
                    players: Object.keys(games[element].players).length
                })
            }
        }
    
        res.send(JSON.stringify(gameList))
    })
    .catch((e) => {
        res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
    });
})

app.get("/api/bgmusiclist", (req, res) => {
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
        res.status(403).send("Unauthorized | No Authentication")
        return;
    }
    
    const directory = fs.readdirSync("src/public/media/sound/game")
    res.send(directory)
})

app.get("/admin", (req, res) => {
    if (!checkAdminAuth(req)) {
        res.send("Invalid authentication")
        return;
    }

    res.sendFile(__dirname + "/admin/index.html")
})

app.get("(/admin)?/css/:endpoint", (req, res) => {
    if (!checkAdminAuth(req)) {
        res.send("Invalid authentication")
        return;
    }

    res.sendFile(__dirname + "/admin/css/" + req.params.endpoint)
})

app.get("(/admin)?/js/:endpoint", (req, res) => {
    if (!checkAdminAuth(req)) {
        res.send("Invalid authentication")
        return;
    }
    
    res.sendFile(__dirname + "/admin/js/" + req.params.endpoint)
})

app.get("(/admin)?/img/:endpoint", (req, res) => {
    if (!checkAdminAuth(req)) {
        res.send("Invalid authentication")
        return;
    }
    
    res.sendFile(__dirname + "/admin/img/" + req.params.endpoint)
})

app.use((req, res, next) => {
    res.status(404).send("404 | Resource Not Found")
})

httpServer.listen(PORT, () => {
    console.log("WebServer listening on port " + PORT)
})

io.on("connection", (socket) => {
    console.log("User Connection | ID: " + socket.id)

    // Anticheat Injects
    const _oldSocketOn = socket.on;
    socket.on = function() {
        var args = Array.from(arguments)

        const _oldCallFunc = args[1]
        args[1] = function() {
            if (anticheat.players[socket.id] == null) {
                createACProfile(socket.id)
            }
    
            if (Date.now() > anticheat.players[socket.id].packetSpam.nextReset) {
                anticheat.players[socket.id].packetSpam.packets = 0; 
                anticheat.players[socket.id].packetSpam.nextReset = Date.now() + 1000;
            }
    
            anticheat.players[socket.id].packetSpam.packets++;
    
            if (anticheat.players[socket.id].packetSpam.packets > GAME_ARGS.ANTICHEAT.MAX_PPS) {
                console.warn(clc.bold.red("[PSL]") + " " + clc.cyan(socket.id) + clc.white(" was disconnected for exceeding the packet limit. (" + anticheat.players[socket.id].packetSpam.packets 
                + "/" + GAME_ARGS.ANTICHEAT.MAX_PPS + ")"))

                socket.emit("error", "Kicked for exceeding packet limit")
                socket.disconnect(true)

                if (games[socket.data.game].players[socket.id] != null) games[socket.data.game].players[socket.id].disconnected = true;
                return;
            }
            
            _oldCallFunc.apply(args[1], Array.from(arguments))
        }

        _oldSocketOn.apply(socket, args)
    }

    socket.on("authentication", (msg) => {
        if (checkAuth(msg) != null) {
            socket.data.auth = checkAuth(msg);

            io.fetchSockets().then(sockets => {
                for (const element of sockets) {
                    if (element.data.auth == socket.data.auth && element.id != socket.id) {
                        console.warn("User " + socket.data.auth + " logged on from another location!")

                        element.emit("error", "Logged on from another location")
                        element.disconnect(true)
                    }
                }
            })

            console.log("User Authentication | Username: " + socket.data.auth + " | ID: " + socket.id)
        } else {
            socket.disconnect(true)
        }
    })

    socket.on("game", (msg) => {
        if (socket.data.auth == null) {
            socket.emit("error", "No Authentication")
            socket.disconnect(true);
            return;
        }

        if (games[msg] == null) {
            socket.emit("error", "Game not found")
            socket.disconnect(true);
            return;
        }

        socket.join(msg)
        socket.data.game = msg

        games[msg].players[socket.id] = {
            health: 100,
            buffs: {},
            position: {
                x: 100 * rand(-GAME_ARGS.WORLDBORDER / 100, GAME_ARGS.WORLDBORDER / 100),
                y: 100 * rand(-GAME_ARGS.WORLDBORDER / 100, GAME_ARGS.WORLDBORDER / 100)
            },
            movement: {
                up: false,
                right: false,
                down: false,
                left: false
            },
            mousePosition: {
                x: 0,
                y: 0
            },
            firing: false,
            firecd: 0,
            disconnected: false,
            username: socket.data.auth
        }

        createACProfile(socket.id)

        socket.to(msg).emit("chatmessage", "-> " + socket.data.auth + " joined the game")
        console.log("User Game Join | Game: " + socket.data.game + " | ID: " + socket.id)
    })

    socket.on("ping", (callback) => {
        if (socket.data.lastPing != null) {
            if ((Date.now() - socket.data.lastPing) < GAME_ARGS.ANTICHEAT.MIN_TIME_BETWEEN_PING) {
                violate(socket.id, "Packets", GAME_ARGS.ANTICHEAT.PINGSPAM_VLS)
                return;
            }
        }
        
        socket.data.lastPing = Date.now()
        callback();
    })

    socket.on("move", (msg) => {
        if (socket.data.game == null) {
            socket.emit("error", "No Game")
            socket.disconnect(true);
            return;
        }

        if (games[socket.data.game].players[socket.id] == null) {
            return;
        }

        try {
            JSON.parse(JSON.stringify(msg))
        } catch {
            violate(socket.id, "Packets")
            return;
        }

        const packet = JSON.parse(JSON.stringify(msg))

        if (packet.direction == null || packet.enable == null) {
            violate(socket.id, "Packets")
            return;
        }

        if (packet.enable != "0" && packet.enable != "1") {
            violate(socket.id, "Packets")
            return;
        }

        const enable = packet.enable == "1"

        switch (packet.direction) {
            case "up":
                games[socket.data.game].players[socket.id].movement.up = enable
                break;
            case "right":
                games[socket.data.game].players[socket.id].movement.right = enable
                break;
            case "down":
                games[socket.data.game].players[socket.id].movement.down = enable
                break;
            case "left":
                games[socket.data.game].players[socket.id].movement.left = enable
                break;
            default:
                violate(socket.id, "Packets")
                socket.emit("error", "Invalid Movement Packet")
        }
    })

    socket.on("mousepos", (msg) => {
        if (socket.data.game == null) {
            socket.emit("error", "No Game")
            socket.disconnect(true);
            return;
        }

        if (games[socket.data.game].players[socket.id] == null) {
            return;
        }

        try {
            JSON.parse(JSON.stringify(msg))
        } catch {
            violate(socket.id, "Packets")
            return;
        }

        const packet = JSON.parse(JSON.stringify(msg))

        if (packet.x == null || packet.y == null || typeof packet.x != "number" || typeof packet.y != "number" || isNaN(packet.x) || isNaN(packet.y)) {
            violate(socket.id, "Packets")
            return;
        }

        if (anticheat.players[socket.id].data.mousepos) {
            const distance = Math.sqrt(Math.pow(anticheat.players[socket.id].data.mousepos.x - packet.x, 2) + Math.pow(anticheat.players[socket.id].data.mousepos.y - packet.y, 2))

            if (distance > GAME_ARGS.ANTICHEAT.MAX_MOUSE_DISTANCE) {
                violate(socket.id, "MousePos")
                return;
            }
        }

        games[socket.data.game].players[socket.id].mousePosition = {
            x: packet.x,
            y: packet.y
        }

        anticheat.players[socket.id].data.mousepos = {
            x: packet.x,
            y: packet.y
        }
    })

    socket.on("fire", (msg) => {
        if (socket.data.game == null) {
            socket.emit("error", "No Game")
            socket.disconnect(true);
            return;
        }

        if (games[socket.data.game].players[socket.id] == null) {
            return;
        }

        if (msg != "0" && msg != "1") {
            violate(socket.id, "Packets")
            return;
        }

        games[socket.data.game].players[socket.id].firing = msg == 1
    })

    socket.on("chatmessage", (msg) => {
        if (socket.data.game == null) {
            socket.emit("error", "No Game")
            socket.disconnect(true);
            return;
        }

        if (msg.toString().trim().length < 1) return;

        if (anticheat.chat[socket.data.auth]) {
            anticheat.chat[socket.data.auth] += msg.toString().trim().length;
        } else {
            anticheat.chat[socket.data.auth] = msg.toString().trim().length;
        }

        anticheat.chat[socket.data.auth] += GAME_ARGS.ANTICHEAT.BASE_CHAT_HEAT

        if (anticheat.chat[socket.data.auth] > GAME_ARGS.ANTICHEAT.MAX_CHAT_HEAT) {
            socket.emit("chatmessage", "> You are chatting too fast.")

            console.warn("[CHAT] Message blocked | Room: " + socket.data.game + " | User: " + socket.data.auth + " | Message (trimmed): " + msg.toString().trim().substring(0, 64) + 
            " | Heat: " + Math.floor(anticheat.chat[socket.data.auth]))

            return;
        }

        io.to(socket.data.game).emit("chatmessage", socket.data.auth + ": " + msg.toString().trim().substring(0, 64))

        console.log(clc.blackBright("[CHAT] Message sent | Room: " + socket.data.game + " | User: " + socket.data.auth + " | Message (trimmed): " + msg.toString().trim().substring(0, 64) + 
        " | Heat: " + Math.floor(anticheat.chat[socket.data.auth])))
    })
    
    socket.on("disconnect", (reason) => {
        if (socket.data.game != null && games[socket.data.game] != null && games[socket.data.game].players[socket.id] != null) {
            games[socket.data.game].players[socket.id].disconnected = true;
            socket.to(socket.data.game).emit("chatmessage", "<- " + socket.data.auth + " left the game")
        }

        delete anticheat.players[socket.id]

        console.log("User Disconnect | Reason: " + reason + " | ID: " + socket.id)
    })
})

function gameTick() {
    const keys = Object.keys(games)
    for (let i = 0; i < keys.length; i++) {
        const game = games[keys[i]]

        const players = Object.keys(game.players)
        for (let p = 0; p < players.length; p++) {
            const player = game.players[players[p]];

            if (player == null) continue;

            if (player.disconnected) {
                delete games[keys[i]].players[players[p]]
                players.splice(p, 1)
                p--;
                continue;
            }

            if (player.health < 1) {
                io.to(players[p]).emit("error", "Game Over")

                delete games[keys[i]].players[players[p]]
                players.splice(p, 1)
                p--;
                continue;
            }

            if (player.movement.up) {
                player.position.y += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? GAME_ARGS.BUFFS.SPEED : 1)
            }

            if (player.movement.right) {
                player.position.x += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? GAME_ARGS.BUFFS.SPEED : 1)
            }

            if (player.movement.down) {
                player.position.y += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? GAME_ARGS.BUFFS.SPEED : 1)
            }

            if (player.movement.left) {
                player.position.x += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? GAME_ARGS.BUFFS.SPEED : 1)
            }

            if (player.position.x > GAME_ARGS.WORLDBORDER) {
                player.position.x = GAME_ARGS.WORLDBORDER
            }

            if (player.position.x < -GAME_ARGS.WORLDBORDER) {
                player.position.x = -GAME_ARGS.WORLDBORDER
            }

            if (player.position.y > GAME_ARGS.WORLDBORDER) {
                player.position.y = GAME_ARGS.WORLDBORDER
            }

            if (player.position.y < -GAME_ARGS.WORLDBORDER) {
                player.position.y = -GAME_ARGS.WORLDBORDER
            }

            if (player.firing && player.firecd < 1) {
                const deltas = calculateDelta(player.position.x, player.position.y, 
                    player.position.x + player.mousePosition.x, player.position.y + player.mousePosition.y, GAME_ARGS.BULLET_SPEED)

                const dx = deltas.dx + (Math.random() - 0.5) * GAME_ARGS.BULLET_RANDOMNESS
                const dy = deltas.dy + (Math.random() - 0.5) * GAME_ARGS.BULLET_RANDOMNESS

                games[keys[i]].bullets.push({
                    x: player.position.x - dx,
                    y: player.position.y - dy,
                    sx: player.position.x,
                    sy: player.position.y,
                    dx: dx,
                    dy: dy,
                    owner: players[p],
                    damage: getBulletDamage() * (Object.keys(game.players[players[p]].buffs).includes("attack")? GAME_ARGS.BUFFS.ATTACK : 1),
                    lifetime: 0
                })

                player.firecd = GAME_ARGS.PLAYER_FIRECD
            } else if (player.firecd > 0) {
                player.firecd--
            }
        }

        for (let b = 0; b < game.bullets.length; b++) {
            const bullet = game.bullets[b];
        
            if (Math.sqrt(Math.pow(bullet.sx - bullet.x) + Math.pow(bullet.sy - bullet.y)) > GAME_ARGS.BULLET_RANGE || bullet.lifetime > GAME_ARGS.BULLET_LIFETIME) {
                games[keys[i]].bullets.splice(b, 1);
                b--;
                continue;
            }
        
            for (let p = 0; p < players.length; p++) {
                const player = game.players[players[p]];
        
                if (bullet.owner != players[p]) {
                    // Calculate the slope of the line segment
                    let slope = bullet.dy / bullet.dx

                    let bulletPosition = {
                        x: bullet.x,
                        y: bullet.y,
                        slope: slope
                    }

                    let playerPosition = {
                        x: player.position.x,
                        y: player.position.y,
                    }

                    if (isCloseToLine(bulletPosition, playerPosition, GAME_ARGS.BULLET_SPEED, GAME_ARGS.PLAYER_HITBOX)) {
                        player.health -= bullet.damage;
                        games[keys[i]].bullets.splice(b, 1);
                        b--;
                        break;
                    }

                }
            }
        
            bullet.x += bullet.dx;
            bullet.y += bullet.dy;
    
            bullet.lifetime++;
        }

        for (let w = 0; w < game.powerups.length; w++) {
            const powerup = game.powerups[w]

            for (p = 0; p < players.length; p++) {
                const player = game.players[players[p]];

                if (Math.abs(player.position.x - powerup.position.x) < GAME_ARGS.POWERUP_HTIBOX && Math.abs(player.position.y - powerup.position.y) < GAME_ARGS.POWERUP_HTIBOX) {
                    if (powerup.buff == "health") {
                        player.health += GAME_ARGS.BUFFS.HEALTH;

                        if (player.health > 100) {
                            player.health = 100
                        }
                    }

                    player.buffs[powerup.buff] = 0

                    if (player.health < 0) {
                        player.health = 0
                    }

                    games[keys[i]].powerups.splice(w, 1)
                    w--;

                    io.to(players[p]).emit("chatmessage", "[!] Picked up " + powerup.buff + " buff!")

                    break;
                }
            }
        }

        for (let m = 0; m < GAME_ARGS.POWERUP_POSSIBILITY.length; m++) {
            for (p = 0; p < players.length; p++) {
                const player = game.players[players[p]];

                const buffloc = Object.keys(player.buffs).indexOf(GAME_ARGS.POWERUP_POSSIBILITY[m])

                if (buffloc > -1) {
                    if (player.buffs[GAME_ARGS.POWERUP_POSSIBILITY[m]] > GAME_ARGS.BUFF_TIMEOUT) {
                        delete player.buffs[GAME_ARGS.POWERUP_POSSIBILITY[m]]
                    } else {
                        player.buffs[GAME_ARGS.POWERUP_POSSIBILITY[m]]++
                    }
                }
            }
        }

        if (game.nextpoweruptime > GAME_ARGS.TICKS_BEFORE_POWERUP) {
            if (game.powerups.length >= GAME_ARGS.MAX_POWERUPS) {
                game.nextpoweruptime = GAME_ARGS.TICKS_BEFORE_POWERUP
            } else {
                game.powerups.push({
                    position: {
                        x: rand(-GAME_ARGS.WORLDBORDER, GAME_ARGS.WORLDBORDER),
                        y: rand(-GAME_ARGS.WORLDBORDER, GAME_ARGS.WORLDBORDER)
                    },
                    buff: GAME_ARGS.POWERUP_POSSIBILITY[rand(0, GAME_ARGS.POWERUP_POSSIBILITY.length)]
                })
                game.nextpoweruptime = 0
            }
        } else {
            game.nextpoweruptime++;
        }

        if (players.length < 1) {
            if (keys[i].startsWith("public_")) continue;

            game.timeout++

            if (game.timeout > GAME_ARGS.TICKS_BEFORE_GAME_TIMEOUT) {
                console.log("Game " + keys[i] + " timed out, deleting...")
                delete games[keys[i]]
                keys.splice(i, 1)
                i--;
                continue;
            }
        }

        io.volatile.to(keys[i]).emit("game", sterilizeGame(game))
    }

    for (const element of Object.keys(anticheat.chat)) {
        anticheat.chat[element] -= GAME_ARGS.ANTICHEAT.CHAT_HEAT_DECLINE;

        if (anticheat.chat[element] < 0) anticheat.chat[element] = 0;
    }
}

console.log("Creating public lobbies...")
for (let _gameToCreate = 0; _gameToCreate < GAME_ARGS.PUBLIC_LOBBIES; _gameToCreate++) {
    const lobbyID = makeid(16)
    games["public_" + lobbyID] = getGameObject();
    console.log(clc.magenta.italic("[PUBLIC LOBBY] ") + "Created public lobby " + lobbyID + " (" + _gameToCreate + ")")
}
console.log("Created " + GAME_ARGS.PUBLIC_LOBBIES + " public lobbies")

setInterval(gameTick, 100)

if (DEBUG) {
    console.warn("Debug mode is enabled! Disable it by adding \"DEBUG=0\" in \".env\".")

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    
    rl.on("line", (input) => {
        const command = input.split(" ")[0]
        const args = input.split(" ").slice(1)
 
        switch (command) {
            case "echo":
                console.log(args.join())
                break;
            case "stop":
                console.log("Closing down listeners")
                rl.close()
                console.log("Saving all files")
                fs.writeFileSync("data/userData.json", JSON.stringify(userData));
                console.log("Shutting down WebSocket connections")
                console.log("Shutting down Express server")
                console.log("Shutting down all games")
                games = {};
                console.log("Shutdown process completed.")
                process.exit()
            case "reload":
                GAME_ARGS = JSON.parse(fs.readFileSync("src/settings.json", "utf8"))
                console.log("Reloaded settings.json")
                break;
            default:
                console.error("Not a valid command. Commands: [echo, reload, stop]")
        }
    })
}

if (INIT_ARGS.includes("CI")) {
    process.exit(0);
}