(function() {
    const c = document.createElement("canvas")
    const ctx = c.getContext("2d")

    const socket = io();
    
    const params = new Proxy(new URLSearchParams(window.location.search), {
        get: (searchParams, prop) => searchParams.get(prop),
    });

    const BACKGROUND_AUDIO = [new Audio('audio_game_0.mp3'), new Audio('audio_game_1.mp3')]
    const SHOOT_SFX = new Audio('shoot.mp3')
    var audioIndex = 0;

    const GAME_ARGS = {
        MOVEMENT_SPEED: 20 / 10
    }

    const BANNED_KEYS = ["Shift", "Meta", "Alt", "Control", "Tab", "CapsLock", "PageUp", "PageDown", "Home", "End", "Delete"]

    var game = null;
    var canShoot = true;

    var chat = [];
    var currentlyTyping = ""
    var chatFocused = false

    var lastPos = {
        x: 0,
        y: 0
    }

    var keysDown = [];

    function getCookie(cname) {
        let name = cname + "=";
        let decodedCookie = decodeURIComponent(document.cookie);
        let ca = decodedCookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) == ' ') {
                c = c.substring(1);
            }
            if (c.indexOf(name) == 0) {
                return c.substring(name.length, c.length);
            }
        }
        return "";
    }

    socket.on("ack", (msg) => {
        switch (msg) {
            case "0":
                break;
        }
    })

    socket.on("game", (msg) => {
        game = JSON.parse(JSON.stringify(msg))

        if (Object.keys(game.players).includes(socket.id)) {
            lastPos = JSON.parse(JSON.stringify(game.players[socket.id].position))
        }
    })

    socket.on("chatmessage", (msg) => {
        chat.push(msg)

        if (chat.length > 10) {
            chat.shift()
        }
    })

    function tick() {
        if (game == null) {
            return;
        }

        const players = Object.keys(game.players)
        for (var p = 0; p < players.length; p++) {
            const player = game.players[players[p]];

            if (player == null) continue;

            if (player.movement.up) {
                player.position.y += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.right) {
                player.position.x += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.down) {
                player.position.y += GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }

            if (player.movement.left) {
                player.position.x += -GAME_ARGS.MOVEMENT_SPEED * (Object.keys(player.buffs).includes("speed")? 2 : 1)
            }
        }

        for (var b = 0; b < game.bullets.length; b++) {
            const bullet = game.bullets[b]

            bullet.x += bullet.dx / 10
            bullet.y += bullet.dy / 10
        }
    }

    function frame() {
        if (game == null) {
            requestAnimationFrame(frame)
            return;
        }

        ctx.resetTransform()

        ctx.strokeStyle = "#FFFFFF"
        ctx.fillStyle = "#FFFFFF"
        ctx.textAlign = "center"
        ctx.font = "20px Comfortaa";

        ctx.clearRect(0, 0, c.width, c.height)

        const players = Object.keys(game.players)
        const playerID = players.indexOf(socket.id)
        const mainPlayer = game.players[players[playerID]] || {
            position: {
                x: lastPos.x,
                y: lastPos.y
            },
            fake: true
        }

        ctx.translate(c.width / 2 - mainPlayer.position.x, c.height / 2 - mainPlayer.position.y)

        const INTERVAL = 100

        ctx.strokeStyle = "#656d7d"
        for (var l = -2000; l < 2000; l++) {
            if (l % INTERVAL != 0) continue;

            ctx.beginPath()
            ctx.moveTo(-2000, l)
            ctx.lineTo(2000, l)
            ctx.stroke()
        }

        for (l = -2000; l < 2000; l++) {
            if (l % INTERVAL != 0) continue;

            ctx.beginPath()
            ctx.moveTo(l, -2000)
            ctx.lineTo(l, 2000)
            ctx.stroke()
        }

        ctx.fillRect(-2, -2, 4, 4)

        ctx.strokeStyle = "#F08080"
        ctx.lineWidth = 5
        ctx.strokeRect(-2000, -2000, 4000, 4000) //Worldborder
        ctx.strokeStyle = "#FFFFFF"
        ctx.lineWidth = 1

        if (mainPlayer.fake) {
            // do nothing, skip basically
        } else {
            ctx.beginPath()
            ctx.arc(mainPlayer.position.x, mainPlayer.position.y, 10, 0, 2 * Math.PI)
            ctx.fill()
    
            ctx.strokeRect(mainPlayer.position.x - 50, mainPlayer.position.y + 15, 100, 3.5)
            ctx.fillRect(mainPlayer.position.x - 50, mainPlayer.position.y + 15, mainPlayer.health, 3.5)

            if (mainPlayer.firecd > 0 && canShoot) {
                SHOOT_SFX.volume = 0.15
                SHOOT_SFX.currentTime = 0
                SHOOT_SFX.play()
                canShoot = false
            }
        }

        if (mainPlayer.firecd == 0) canShoot = true;

        for (p = 0; p < players.length; p++) {
            if (p == playerID) continue;

            const player = game.players[players[p]];

            ctx.beginPath()
            ctx.arc(player.position.x, player.position.y, 10, 0, 2 * Math.PI)
            ctx.fill()

            ctx.strokeRect(player.position.x - 50, player.position.y + 15, 100, 3.5)
            ctx.fillRect(player.position.x - 50, player.position.y + 15, player.health, 3.5)

            ctx.fillText(player.username, player.position.x, player.position.y - 25)
        }

        for (var b = 0; b < game.bullets.length; b++) {
            const bullet = game.bullets[b]

            ctx.beginPath()
            ctx.arc(bullet.x, bullet.y, 5, 0, 2 * Math.PI)
            ctx.fill()
        }

        ctx.fillStyle = "#B9E5E1"

        for (var w = 0; w < game.powerups.length; w++) {
            const powerup = game.powerups[w]

            ctx.beginPath()
            ctx.arc(powerup.position.x, powerup.position.y, 7, 0, 2 * Math.PI)
            ctx.fill()

            ctx.fillText(powerup.buff.charAt(0).toUpperCase() + powerup.buff.substring(1), powerup.position.x, powerup.position.y - 25)
        }

        ctx.fillStyle = "#FFFFFF"

        ctx.resetTransform()
        ctx.textAlign = "left"

        if (mainPlayer.fake) {
            //Skip basically
        } else {
            var buffStr = ""
    
            for (var buff in Object.keys(mainPlayer.buffs)) {
                buffStr += Object.keys(mainPlayer.buffs)[buff].charAt(0).toUpperCase() + Object.keys(mainPlayer.buffs)[buff].substring(1) + " "
            }

            ctx.fillText("Buffs: " + buffStr, 10, 25)
        }

        ctx.font = "15px Comfortaa";

        if (chatFocused) {
            ctx.globalAlpha = 0.25
            ctx.fillStyle = "#000000"
            ctx.fillRect(0, 0, c.width, c.height)
            ctx.globalAlpha = 1
        }

        ctx.fillStyle = "#FFFFFF"

        for (var chatIteration = 0; chatIteration < chat.length; chatIteration++) {
            ctx.fillText(chat[chatIteration], 10, c.height - 20 - ((chat.length - chatIteration) * 15))
        }

        ctx.fillText(currentlyTyping, 10, c.height - 15)

        requestAnimationFrame(frame)
    }

    document.addEventListener("keydown", (e) => {
        if (keysDown.includes(e.key)) return;
        keysDown.push(e.key)

        if (chatFocused) {
            if (e.key == "Enter") {
                chatFocused = false;
                socket.emit("chatmessage", currentlyTyping)
                currentlyTyping = ""
                return;
            }

            if (e.key == "Escape") {
                chatFocused = false;
                currentlyTyping = "";
                return;
            }

            if (BANNED_KEYS.includes(e.key)) return;
            if (e.key.startsWith("F") && e.key.length > 1) return;
            if (e.key.startsWith("Arrow")) return;

            if (e.key == "Backspace") {
                currentlyTyping = currentlyTyping.substring(0, currentlyTyping.length - 1)
                return;
            }

            currentlyTyping += e.key
            return;
        }

        switch (e.key) {
            case "w":
                socket.emit("move", {
                    direction: "up",
                    enable: "1"
                })
                break;
            case "d":
                socket.emit("move", {
                    direction: "right",
                    enable: "1"
                })
                break;
            case "s":
                socket.emit("move", {
                    direction: "down",
                    enable: "1"
                })
                break;
            case "a":
                socket.emit("move", {
                    direction: "left",
                    enable: "1"
                })
                break;
            case "t":
                chatFocused = true;
                break;
            default:
                //nothing
        }
    })

    document.addEventListener("keyup", (e) => {
        if (keysDown.includes(e.key)) {
            keysDown.splice(keysDown.indexOf(e.key), 1)
        }

        switch (e.key) {
            case "w":
                socket.emit("move", {
                    direction: "up",
                    enable: "0"
                })
                break;
            case "d":
                socket.emit("move", {
                    direction: "right",
                    enable: "0"
                })
                break;
            case "s":
                socket.emit("move", {
                    direction: "down",
                    enable: "0"
                })
                break;
            case "a":
                socket.emit("move", {
                    direction: "left",
                    enable: "0"
                })
                break;
            default:
                //nothing
        }
    })

    document.addEventListener("mousedown", (e) => {
        socket.emit("fire", "1")
    })

    document.addEventListener("mouseup", (e) => {
        socket.emit("fire", "0")
    })

    document.addEventListener("mousemove", (e) => {
        socket.emit("mousepos", {
            x: e.x - c.width / 2,
            y: e.y - c.height / 2
        })
    })

    socket.emit("authentication", getCookie("token"))
    socket.emit("game", params.id)

    c.width = document.body.clientWidth
    c.height = document.body.clientHeight

    requestAnimationFrame(frame)
    setInterval(tick, 10)

    for (var music = 0; music < BACKGROUND_AUDIO.length; music++) {
        BACKGROUND_AUDIO[music].volume = 0.2
        
        BACKGROUND_AUDIO[music].addEventListener("ended", () => {
            audioIndex++;
            if (audioIndex >= BACKGROUND_AUDIO.length) {
                audioIndex = 0;
            }

            BACKGROUND_AUDIO[audioIndex].play()
        })
    }

    document.body.addEventListener("keydown", () => {
        BACKGROUND_AUDIO[audioIndex].play()
    })

    document.body.addEventListener("mousedown", () => {
        BACKGROUND_AUDIO[audioIndex].play()
    })

    document.body.appendChild(c)
})()