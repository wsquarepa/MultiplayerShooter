(function() {
    function deleteAllCookies() {
        var cookies = document.cookie.split(";");
    
        for (const element of cookies) {
            var cookie = element;
            var eqPos = cookie.indexOf("=");
            var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT";
        }
    }

    function convertToExpiresIn(starttime, endtime) {
        var epochms = endtime - starttime

        if (epochms < 0) {
            return {
                ms: 0,
                s: 0,
                m: 0,
                h: 0,
                d: 0
            }
        }

        const ms = epochms % 1000
        epochms /= 1000
        epochms = Math.floor(epochms)
        const s = epochms % 60
        epochms /= 60
        epochms = Math.floor(epochms)
        const m = epochms % 60
        epochms /= 60
        epochms = Math.floor(epochms)
        const h = epochms % 24
        epochms /= 24
        epochms = Math.floor(epochms)
        const d = epochms % 30

        return {
            ms: ms,
            s: s,
            m: m,
            h: h,
            d: d
        }
    }

    function refreshPublicGames() {
        const publicGamesHolder = document.createElement("div")
        publicGamesHolder.classList.add("center")

        const publicGameLabel = document.createElement("div")
        publicGameLabel.classList.add("center")
        publicGameLabel.innerHTML = "Public Games"
        publicGameLabel.style.fontSize = "18px"

        const publicGameRefresh = document.createElement("button")
        publicGameRefresh.classList.add("center")
        publicGameRefresh.innerHTML = "Refresh"
        publicGameRefresh.addEventListener("click", (e) => {
            publicGamesHolder.remove()
            refreshPublicGames()
        })

        publicGamesHolder.appendChild(publicGameLabel)
        publicGamesHolder.appendChild(publicGameRefresh)

        fetch("/api/publicGames")
        .then(res => res.json())
        .then(res => {
            for (var i = 0; i < res.length; i++) {
                const publicGame = document.createElement("div")

                const publicGameName = document.createElement("div")
                publicGameName.innerHTML = "Public Game " + i + " (" + res[i].players + " online)"
                publicGameName.style.display = "inline-block"

                const spacer = document.createElement("div")
                spacer.style.width = "50px"
                spacer.style.display = "inline-block"

                const publicGameJoin = document.createElement("button")
                publicGameJoin.style.float = "right"
                publicGameJoin.id = res[i].id
                publicGameJoin.innerHTML = "Join Game"
                publicGameJoin.addEventListener("click", () => {
                    location = "/game?id=" + publicGameJoin.id
                })

                publicGame.appendChild(publicGameName)
                publicGame.appendChild(spacer)
                publicGame.appendChild(publicGameJoin)

                publicGamesHolder.appendChild(publicGame)
            }

            block.appendChild(publicGamesHolder)
        })
        .catch(() => {
            const errorLabel = document.createElement("div")
            errorLabel.classList.add("center")
            errorLabel.style.fontSize = "18px"
            errorLabel.style.color = "lightcoral"
            errorLabel.innerHTML = "429 Too Many Requests"

            block.appendChild(errorLabel)
        })
    }

    const main = document.createElement("div")
    main.classList.add("middle")
    main.style.width = "1000px"
    main.style.height = "500px"

    const block = document.createElement("div")
    block.classList.add("center")

    const mainTitle = document.createElement("div")
    mainTitle.innerHTML = "Shooter"
    mainTitle.classList.add("center")
    mainTitle.style.fontSize = "24px"
    

    block.appendChild(mainTitle)
    block.appendChild(document.createElement("hr"))

    document.addEventListener("DOMContentLoaded", () => {
        if (document.cookie.includes("token")) {
            fetch("/login", { method: "POST" }).then(res => {
                if (res.status == 200) {
                    authed = true;

                    res.json().then(res => {
                        const joinGameModal = document.createElement("div")
                        joinGameModal.classList.add("center")
                    
                        const input = document.createElement("input")
                        input.placeholder = "Game ID"
                    
                        const joinButton = document.createElement("button")
                        joinButton.innerHTML = "Join game"
                    
                        const newButton = document.createElement("button")
                        newButton.innerHTML = "Create new game"
                    
                        joinButton.addEventListener("click", () => {
                            location = "/game?id=" + input.value
                        })
                    
                        newButton.addEventListener("click", () => {
                            newButton.disabled = true;

                            const loadHolder = document.createElement("div")
    
                            const loadLabel = document.createElement("div")
                            const loadProgress = document.createElement("progress")
    
                            const timeToWait = Math.random() * 1000;
                            var previousRandomAddition = -1;
    
                            loadHolder.classList.add("center")
    
                            loadLabel.classList.add("center")
                            loadProgress.style.display = "block"
                            loadProgress.style.marginLeft = "auto"
                            loadProgress.style.marginRight = "auto"
    
                            loadLabel.innerHTML = "Creating Lobby..."
                            loadProgress.max = 100
                            loadProgress.value = 0
    
                            loadHolder.appendChild(loadLabel)
                            loadHolder.appendChild(loadProgress)
    
                            joinGameModal.appendChild(loadHolder)
    
                            setInterval(() => {
                                const randomAddition = (previousRandomAddition < 0? 1 - previousRandomAddition:Math.random())
    
                                loadProgress.value += randomAddition
    
                                if (previousRandomAddition < 0) {
                                    previousRandomAddition = randomAddition
                                } else {
                                    previousRandomAddition = -1
                                }
                            }, timeToWait / 100)

                            setTimeout(() => {
                                fetch("/api/lobby", {
                                    method: "POST"
                                }).then(res => {
                                    if (res.status == 200) {
                                        res.text()
                                        .then(res => {
                                            location = "/game?id=" + res
                                        })
                                    } else {
                                        loadLabel.innerHTML = "429 | Too many requests"
                                        loadLabel.style.color = "lightcoral"
                                    }
                                })
                                .catch(() => {
                                    loadLabel.innerHTML = "Failed to create lobby"
                                    loadLabel.style.color = "lightcoral"
                                })
                                .finally(() => {
                                    setTimeout(() => {
                                        loadHolder.remove()
                                    }, 3000)
                                    
                                    loadProgress.remove()
                                    newButton.disabled = false
                                })
                            }, timeToWait)
                        })
                    
                        joinGameModal.appendChild(input)
                        joinGameModal.appendChild(joinButton)
                        joinGameModal.appendChild(newButton)

                        block.appendChild(joinGameModal)
                        block.appendChild(document.createElement("hr"))

                        const welcomeBanner = document.createElement("div")
                        welcomeBanner.innerHTML = "Welcome, " + res.username
                        welcomeBanner.style.display = "inline-block"

                        const logoutButton = document.createElement("button")
                        logoutButton.innerHTML = "Log out"
                        logoutButton.style.float = "right"

                        logoutButton.addEventListener("click", () => {
                            location = "/logout"
                        })

                        block.appendChild(welcomeBanner)
                        block.appendChild(logoutButton)
                        block.appendChild(document.createElement("hr"))

                        const loadHolder = document.createElement("div")

                        const loadLabel = document.createElement("div")
                        const loadProgress = document.createElement("progress")

                        const timeToWait = Math.random() * 500;
                        var previousRandomAddition = -1;

                        loadHolder.classList.add("center")

                        loadLabel.classList.add("center")
                        loadProgress.style.display = "block"
                        loadProgress.style.marginLeft = "auto"
                        loadProgress.style.marginRight = "auto"

                        loadLabel.innerHTML = "Loading data..."
                        loadProgress.max = 100
                        loadProgress.value = 0

                        loadHolder.appendChild(loadLabel)
                        loadHolder.appendChild(loadProgress)

                        block.appendChild(loadHolder)

                        setInterval(() => {
                            const randomAddition = (previousRandomAddition < 0? 1 - previousRandomAddition:Math.random())

                            loadProgress.value += randomAddition

                            if (previousRandomAddition < 0) {
                                previousRandomAddition = randomAddition
                            } else {
                                previousRandomAddition = -1
                            }
                        }, timeToWait / 100)

                        setTimeout(() => {
                            refreshPublicGames()
                            loadHolder.remove()
                        }, timeToWait)
                    })
                } else {
                    deleteAllCookies()
                    location.reload()
                }
            }).catch((e) => {
                deleteAllCookies()
                location.reload()
            })
        } else {
            const authenticationBanner = document.createElement("div")
            authenticationBanner.innerHTML = "Log in / Sign up"
            authenticationBanner.classList.add("center")
            authenticationBanner.style.fontSize = "18px"

            const usernameInput = document.createElement("input")
            usernameInput.placeholder = "Username"
        
            const passwordInput = document.createElement("input")
            passwordInput.placeholder = "Password"
            passwordInput.type = "password"
        
            const loginButton = document.createElement("button")
            loginButton.innerHTML = "Log In (Press Enter)"
        
            const signupButton = document.createElement("button")
            signupButton.innerHTML = "Sign up"
        
            loginButton.addEventListener("click", () => {
                fetch("/login", {
                    method: "POST",
                    headers: {
                        "Content-Type":"application/json"
                    },
                    body: JSON.stringify({
                        username: usernameInput.value,
                        password: passwordInput.value
                    })
                }).then(res => {
                    if (res.status != 200) {
                        res.text().then((res) => {
                            const errorBox = document.createElement("div")
                            errorBox.style.color = "lightcoral"
                            errorBox.innerHTML = res;
        
                            setTimeout(() => {
                                errorBox.remove()
                            }, 5000)
        
                            block.appendChild(errorBox)
                        })
                    } else {
                        location.reload()
                    }
                })
            })
        
            signupButton.addEventListener("click", () => {
                fetch("/register", {
                    method: "POST",
                    headers: {
                        "Content-Type":"application/json"
                    },
                    body: JSON.stringify({
                        username: usernameInput.value,
                        password: passwordInput.value
                    })
                }).then(res => {
                    if (res.status != 200) {
                        res.text().then((res) => {
                            const errorBox = document.createElement("div")
                            errorBox.style.color = "lightcoral"
                            errorBox.innerHTML = res;
        
                            setTimeout(() => {
                                errorBox.remove()
                            }, 5000)
        
                            block.appendChild(errorBox)
                        })
                    } else {
                        location.reload()
                    }
                })
            })
        
            document.body.addEventListener("keydown", (e) => {
                if (e.key == "Enter") loginButton.click();
            })

            block.appendChild(authenticationBanner)
            block.appendChild(document.createElement("br"))
            block.appendChild(usernameInput)
            block.appendChild(passwordInput)
            block.appendChild(loginButton)
            block.appendChild(signupButton)
        }
    })
    
    main.appendChild(block)

    document.body.appendChild(main)
})()