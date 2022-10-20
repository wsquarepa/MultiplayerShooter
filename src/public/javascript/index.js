(function() {
    function deleteAllCookies() {
        var cookies = document.cookie.split(";");
    
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i];
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
                    
                        const spectatorLabel = document.createElement("label")
                        spectatorLabel.innerHTML = "Spectator Mode: "
                    
                        const spectatorCheck = document.createElement("input")
                        spectatorCheck.type = "checkbox"
                    
                        joinButton.addEventListener("click", () => {
                            location = "/game?id=" + input.value + (spectatorCheck.checked? "&spectator=true":"")
                        })
                    
                        newButton.addEventListener("click", () => {

                            const loadHolder = document.createElement("div")
    
                            const loadLabel = document.createElement("div")
                            const loadProgress = document.createElement("progress")
    
                            const timeToWait = Math.random() * 5000;
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
                                }).then(res => res.text())
                                .then(res => {
                                    location = "/game?id=" + res
                                })
                            }, timeToWait)
                        })
                    
                        joinGameModal.appendChild(input)
                        joinGameModal.appendChild(joinButton)
                        joinGameModal.appendChild(newButton)
                        joinGameModal.appendChild(document.createElement("br"))
                        joinGameModal.appendChild(spectatorLabel)
                        joinGameModal.appendChild(spectatorCheck)

                        block.appendChild(joinGameModal)
                        block.appendChild(document.createElement("hr"))

                        const welcomeBanner = document.createElement("div")
                        welcomeBanner.innerHTML = "Welcome, " + res.username
                        welcomeBanner.style.display = "inline-block"

                        const logoutButton = document.createElement("button")
                        logoutButton.innerHTML = "Log out"
                        logoutButton.style.float = "right"

                        logoutButton.addEventListener("click", () => {
                            deleteAllCookies()
                            location.reload()
                        })

                        block.appendChild(welcomeBanner)
                        block.appendChild(logoutButton)
                        block.appendChild(document.createElement("hr"))

                        const loadHolder = document.createElement("div")

                        const loadLabel = document.createElement("div")
                        const loadProgress = document.createElement("progress")

                        const timeToWait = Math.random() * 2500;
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
                            const noDataLabel = document.createElement("div")
                            noDataLabel.innerHTML = "No Data Found."
                            noDataLabel.classList.add("center")

                            loadHolder.remove()
                            block.appendChild(noDataLabel)
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