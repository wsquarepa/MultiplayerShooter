const express = require('express')
const dotenv = require('dotenv')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcrypt')
const obfuscator = require('javascript-obfuscator');
const clc = require('cli-color')
const readline = require("readline");
const { RateLimiterMemory } = require('rate-limiter-flexible')
const { createServer } = require("http");
const { Server } = require("socket.io");

dotenv.config()

const PORT = parseInt(process.env.PORT) || 8080

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS) || 8
const JWT_KEY = process.env.JWT_KEY || "secret"

const GAME_ARGS = {
    MOVEMENT_SPEED: 20,
    TICKS_BEFORE_GAME_TIMEOUT: 10 * 60, //1 Minute
    WORLDBORDER: 2000,
    TICKS_BEFORE_POWERUP: 10 * 10, // 10 seconds,
    MAX_POWERUPS: 10,
    POWERUP_HTIBOX: 20,
    POWERUP_POSSIBILITY: ["attack", "health", "speed"],
    BUFFS: {
        SPEED: 2,
        ATTACK: 1.5,
        HEALTH: 10
    },
    BUFF_TIMEOUT: 10 * 10,
    PLAYER_HITBOX: 12,
    PLAYER_FIRECD: 1,
    BULLET_SPEED: 30,
    BULLET_DAMAGE: () => { return rand(3, 9) },
    BULLET_RANGE: 500,
    BULLET_LIFETIME: 100
}

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

const lobbyLimiter = new RateLimiterMemory({
    points: 5,
    duration: 30,
    blockDuration: 60 * 5 //300 seconds | 5 minutes
})

const app = express()
const httpServer = createServer(app);
const io = new Server(httpServer);

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
    return Math.floor(Math.random() * (max - min) + min);
}

/**
 * Checks authentication token.
 * @param {String} token 
 * @returns null if invalid token, username otherwise
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

// ==============================

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
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
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
    if (!req.cookies.token || checkAuth(req.cookies.token) == null) {
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

            games[gameid] = {
                players: {},
                bullets: [],
                powerups: [],
                timeout: 0,
                nextpoweruptime: 0
            }
    
            console.log("Created game " + gameid)
            
            res.send(gameid)
        })
        .catch((e) => {
            res.status(429).send('Too Many Requests | Try again in ' + e.msBeforeNext + "ms");
        });
    })

app.use((req, res, next) => {
    res.status(404).send("404 | Resource Not Found")
})

httpServer.listen(PORT, () => {
    console.log("WebServer listening on port " + PORT)
})

io.on("connection", (socket) => {
    console.log("User Connection | ID: " + socket.id)

    socket.on("authentication", (msg) => {
        if (checkAuth(msg) != null) {
            socket.data.auth = checkAuth(msg);
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
                x: 0,
                y: 0
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

        console.log("User Game Join | Game: " + socket.data.game + " | ID: " + socket.id)

        socket.emit("ack", "0")
    })

    socket.on("ping", (callback) => {
        callback();
    })

    socket.on("move", (msg) => {
        if (socket.data.game == null) {
            socket.emit("error", "No Game")
            socket.disconnect(true);
            return;
        }

        if (games[socket.data.game].players[socket.id] == null) {
            socket.emit("error", "No Game")
            return;
        }

        try {
            JSON.parse(JSON.stringify(msg))
        } catch {
            socket.emit("error", "Invalid Movement Packet")
            return;
        }

        const packet = JSON.parse(JSON.stringify(msg))

        if (packet.direction == null || packet.enable == null) {
            socket.emit("error", "Invalid Movement Packet")
            return;
        }

        if (packet.enable != "0" && packet.enable != "1") {
            socket.emit("error", "Invalid Movement Packet")
            return;
        }

        const enable = packet.enable == 1

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
            socket.emit("error", "No Game")
            return;
        }

        try {
            JSON.parse(JSON.stringify(msg))
        } catch {
            socket.emit("error", "Invalid Movement Packet")
            return;
        }

        const packet = JSON.parse(JSON.stringify(msg))

        if (packet.x == null || packet.y == null) {
            socket.emit("error", "Invalid Movement Packet")
            return;
        }

        games[socket.data.game].players[socket.id].mousePosition = {
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
            socket.emit("error", "No Game")
            return;
        }

        if (msg != "0" && msg != "1") {
            socket.emit("error", "Invalid Firing Packet")
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

        socket.to(socket.data.game).emit("chatmessage", msg)
    })
    
    socket.on("disconnect", (reason) => {
        if (socket.data.game != null && games[socket.data.game] != null && games[socket.data.game].players[socket.id] != null) {
            games[socket.data.game].players[socket.id].disconnected = true;
        }

        console.log("User Disconnect | Reason: " + reason + " | ID: " + socket.id)
    })
})

function gameTick() {
    const keys = Object.keys(games)
    for (var i = 0; i < keys.length; i++) {
        const game = games[keys[i]]

        const players = Object.keys(game.players)
        for (var p = 0; p < players.length; p++) {
            const player = game.players[players[p]];

            if (player == null) continue;

            if (player.disconnected || player.health < 1) {
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

                games[keys[i]].bullets.push({
                    x: player.position.x,
                    y: player.position.y,
                    sx: player.position.x,
                    sy: player.position.y,
                    dx: deltas.dx,
                    dy: deltas.dy,
                    owner: players[p],
                    damage: GAME_ARGS.BULLET_DAMAGE() * (Object.keys(game.players[players[p]].buffs).includes("attack")? GAME_ARGS.BUFFS.ATTACK : 1),
                    lifetime: 0
                })

                player.firecd = GAME_ARGS.PLAYER_FIRECD
            } else if (player.firecd > 0) {
                player.firecd--
            }
        }

        for (var b = 0; b < game.bullets.length; b++) {
            const bullet = game.bullets[b]

            if (Math.sqrt(Math.abs(bullet.sx - bullet.x) + Math.abs(bullet.sy - bullet.y)) > GAME_ARGS.BULLET_RANGE || bullet.lifetime > GAME_ARGS.BULLET_LIFETIME) {
                games[keys[i]].bullets.splice(b, 1)
                b--;
                continue;
            }

            bullet.x += bullet.dx
            bullet.y += bullet.dy

            bullet.lifetime++

            for (p = 0; p < players.length; p++) {
                const player = game.players[players[p]];

                if (Math.abs(player.position.x - bullet.x) < GAME_ARGS.PLAYER_HITBOX && Math.abs(player.position.y - bullet.y) < GAME_ARGS.PLAYER_HITBOX) {
                    player.health -= bullet.damage

                    games[keys[i]].bullets.splice(b, 1)
                    b--;

                    break;
                }
            }
        }

        for (var w = 0; w < game.powerups.length; w++) {
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

                    games[keys[i]].powerups.splice(w, 1)
                    w--;

                    break;
                }
            }
        }

        for (var m = 0; m < GAME_ARGS.POWERUP_POSSIBILITY.length; m++) {
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
            game.timeout++

            if (game.timeout > GAME_ARGS.TICKS_BEFORE_GAME_TIMEOUT) {
                console.log("Game " + keys[i] + " timed out, deleting...")
                delete games[keys[i]]
                keys.splice(i, 1)
                i--;
                continue;
            }
        }

        io.to(keys[i]).emit("game", game)
    }
}

setInterval(gameTick, 100)

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