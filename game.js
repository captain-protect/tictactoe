var static = require('node-static');
var util = require('util');
var dot = require('dot');
var fs = require('fs');
var httpModule = require('http');
var cookiesModule = require('cookies');


function Helpers() {
    return {}
}
Helpers.buildRandomString = function(n) {
    var chars = "0123456789abcdefghijklmnopqurstuvwxyzABCDEFGHIJKLMNOPQURSTUVWXYZ";
    var result = "";
    while (n--) {
        result += chars.substr( Math.floor(Math.random() * chars.length), 1);
    }
    return result;
}
Helpers.templateLoader = function(filename) {
    return {
        template : null,
        templateDate : null,
        load : function () {
            if (!this.templateDate || fs.statSync(filename).atime > this.templateDate)
            {
                console.log("Loading '" + filename + "'");
                var data = fs.readFileSync(filename);
                this.template = dot.template(data);
                this.templateDate = fs.statSync(filename).atime;
            }
            return this.template;
        }
    };
};

function Game(id) {
    var game = {
        id : id,
        players : [],
        boardSize : 5,
        rows : [],
        cols : [],
        board : {},
        moves : [],
        state : 'go',
        rowCounter : [[],[]],
        colCounter : [[],[]],
        diag1Counter : [],
        diag2Counter : [],

        moveFinalizers : [],
        initBoard : function() {
            for (var i = 1; i <= this.boardSize; i++) {
                this.rows.push(i);
                this.cols.push(i);
                this.rowCounter[0][i] = 0;
                this.rowCounter[1][i] = 0;
                this.colCounter[0][i] = 0;
                this.colCounter[1][i] = 0;
            }
            this.diag1Counter.push(0);
            this.diag1Counter.push(0);
            this.diag2Counter.push(0);
            this.diag2Counter.push(0);

            for (var i in this.rows) { var row = this.rows[i];
                for (var j in this.cols) { var col = this.cols[j];
                    this.board[row + "," + col] = {
                        type: "free"
                    };
                }
            }
            this.triggerStateChange();
        },
        makeMove : function(row, col, playerNum) {
            var lastMove = this.moves.length;
            if (this.state == 'go'
                && lastMove % 2 == playerNum
                && this.board[row + "," + col] != null
                && this.board[row + "," + col].type == 'free') {

                this.moves.push({type : 'move', row : row, col : col, player : playerNum});

                var cell = this.board[row + "," + col];
                cell.type = playerNum == 0 ? "tic" : "tac";
                cell.owner = playerNum;

                this.updateCounters(row, col, playerNum);

                this.checkWin(0);
                this.checkWin(1);
                this.checkDraw();
                this.callFinalizers();
                this.triggerStateChange();
                return true;
            }
            return false;
        },
        passTurn : function() {
            this.moves.push({type : 'passedTurn'});
            this.callFinalizers();
            this.triggerStateChange();
        },
        checkPlayer : function(playerId) {
            for (var num in this.players) {
                if (this.players[num] == playerId) {
                    return num;
                }
            }
            return null;
        },
        createPlayer : function() {
            var players = this.players;
            var newPlayer = Helpers.buildRandomString(5);
            players.push(newPlayer);
            console.log("Player " + players.length + " joined");
            return newPlayer;
        },
        getPlayersCount : function() {
            return this.players.length;
        },
        couldMove : function(playerNum) {
            var lastMove = this.moves.length;
            return (lastMove % 2 == playerNum) && this.state == 'go';
        },
        couldPassTurn : function(playerNum) {
            return this.moves.length == 0 && playerNum == 0;
        },
        addMoveFinalizer : function(handler) {
            this.moveFinalizers.push(handler);
        },
        callFinalizers : function() {
            for (var i in this.moveFinalizers) {
                this.moveFinalizers[i]();
            }
            this.moveFinalizers = [];
        },
        updateCounters : function(row, col, playerNum) {
            this.rowCounter[playerNum][row]++;
            this.colCounter[playerNum][col]++;
            if (row == col) {
                this.diag1Counter[playerNum]++;
            }
            if (row == this.boardSize + 1 - col) {
                this.diag2Counter[playerNum]++;
            }
        },
        fillRow : function(row, value) {
            for (var i in this.cols) { var col = this.cols[i];
                this.board[row + "," + col].type = value;
            }
        },
        fillCol : function(col, value) {
            for (var i in this.rows) { var row = this.rows[i];
                this.board[row + "," + col].type = value;
            }
        },
        fillDiag1 : function(value) {
            for (var i in this.rows) { var row = this.rows[i]; var col = this.cols[i];
                this.board[row + "," + col].type = value;
            }
        },
        fillDiag2 : function(value) {
            for (var i in this.rows) { var row = this.rows[i]; var col = this.cols[this.cols.length - i - 1];
                this.board[row + "," + col].type = value;
            }
        },
        checkWin : function(player) {
            var win = false;
            for (var i in this.rows) { var row = this.rows[i];
                if (this.rowCounter[player][row] == this.boardSize) {
                    this.fillRow(row, "crossed");
                    win = true;
                }
            }
            for (var i in this.cols) { var col = this.cols[i];
                if (this.colCounter[player][col] == this.boardSize) {
                    this.fillCol(col, "crossed");
                    win = true;
                }
            }
            if (this.diag1Counter[player] == this.boardSize) {
                win = true;
                this.fillDiag1("crossed");
            }
            if (this.diag2Counter[player] == this.boardSize) {
                win = true;
                this.fillDiag2("crossed");
            }

            if (win) {
                this.state = "win" + player;
                this.triggerStateChange();
            }
            return true;
        },
        checkDraw : function() {
            var draw = true;
            for (var i in this.rows) { var row = this.rows[i];
                if (this.rowCounter[0][row] + this.rowCounter[1][row] != this.boardSize) {
                    draw = false;
                    break;
                }
            }
            if (draw) {
                this.state = "draw"
                this.triggerStateChange();
            }
        },
        triggerStateChange : function() {
            this.stateTag = new Date();
        },
        getSaveFilename : function() {
            return "games/" + this.id + ".json";
        },
        saveStateToDisk : function() {
            if (!this.diskTag || this.stateTag > this.diskTag) {
                this.diskTag = this.stateTag;
                var saveObject = {};
                Game.transferState(this, saveObject);
                console.log("Saving game to disk " + this.id);
                fs.writeFile(this.getSaveFilename(), JSON.stringify(saveObject));
            }
        }
    };
    game.initBoard();
    Game.allGames[game.id] = game;
    return game;
}

Game.allGames = {}
Game.getGame = function(id) {
    var game = this.allGames[id];
    if (game == null) {
        console.log("Loading game " + id + "...")
        game = new Game(id);
        var saveFilename = game.getSaveFilename();
        if (fs.existsSync(saveFilename))
        {
            var content = fs.readFileSync(saveFilename);
            var json = JSON.parse(content);
            Game.transferState(json, game);
            game.diskTag = game.stateTag = new Date();
            console.log("Game " + id + " loaded");
        } else {
            console.log("No such game");
            return null;
        }
    }
    return game;
}
Game.transferState = function(from, to) {
    to.id = from.id;
    to.players = from.players;
    to.boardSize = from.boardSize;
    to.rows = from.rows;
    to.cols = from.cols;
    to.board = from.board;
    to.moves = from.moves;
    to.state = from.state;
    to.rowCounter = from.rowCounter;
    to.colCounter = from.colCounter;
    to.diag1Counter = from.diag1Counter;
    to.diag2Counter = from.diag2Counter;
}


function TicTacToeServer() {
    var server = {
        cookiesInjector : cookiesModule.connect(),
        serverPath : "http://10.17.10.110/",
        initTemplateLoaders : function() {
            this.boardTemplateLoader = Helpers.templateLoader("templates/board.html");
        },
        handlePlayer : function(req, res, game) {
            var player = req.cookies.get("player");
            var playerNum = game.checkPlayer(player);
            if (!playerNum) {
                if (game.getPlayersCount() < 2) {
                    player = game.createPlayer();
                    playerNum = game.checkPlayer(player);
                    req.cookies.set("player", player);
                } else {
                    playerNum = 3;
                }
            }
            return playerNum;
        },
        handleGame : function (req, res, game) {
            var playerNum = this.handlePlayer(req, res, game);
            var boardTemplate = this.boardTemplateLoader.load();
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});


            var moveMatch;
            if (/.+\/waitMove/.test(req.url)) {
                game.addMoveFinalizer(function() {
                    res.end();
                });
                return;
            } else if (/.+\/passTurn/.test(req.url)) {
                if (game.couldPassTurn(playerNum)) {
                    game.passTurn();
                }
            } else if ((moveMatch = req.url.match(/x(\d+)y(\d+)$/)) != null) {
                var row = moveMatch[1];
                var col = moveMatch[2];
                game.makeMove(row, col, playerNum);
            }

            res.write(boardTemplate({
                game : game,
                playerNum : playerNum,
                serverPath : this.serverPath
            }));

            res.end();
        },
        staticServer : new(static.Server)('public', {cache: 600, headers: { 'X-Powered-By': 'node-static' } }),
        handleStatic : function (req, res) {
            var server = this;
            req.addListener('end', function() {
                server.staticServer.serve(req, res, function(err, result) {
                    if (err) {
                        console.error('Error serving %s - %s', req.url, err.message);
                        if (err.status === 404 || err.status === 500) {
                            file.serveFile(util.format('/%d.html', err.status), err.status, {}, req, res);
                        } else {
                            res.writeHead(err.status, err.headers);
                            res.end();
                        }
                    } else {
                        console.log('%s - SERVED', req.url);
                    }
                });
            });
        },
        handleRequests : function (req, res) {
            this.cookiesInjector(req, res, function() {});
            if (/\/js/.test(req.url) || /\/img/.test(req.url) || /\/css/.test(req.url)) {
                this.handleStatic(req, res);
                return;
            } else if (req.url == "/") {
                var game = new Game(Helpers.buildRandomString(7));
                console.log("New game " + game.id);
                res.writeHead(301, 'Moved Permanently', {'Location': '/' + game.id + '/', 'Cache-Control': 'no-cache'});
                res.end();
                game.saveStateToDisk();
                return;
            } else {
                var match = req.url.match(/\/([^\/]+)\//);
                if (match)
                {
                    var id = match[1];
                    var game = Game.getGame(id);
                    if (game) {
                        console.log("Game visit " + req.url);
                        this.handleGame(req, res, game);
                        game.saveStateToDisk();
                    } else {
                        res.writeHead(404, "Game not started");
                        res.end("Game not started");
                    }
                } else {
                    res.writeHead(404, "Not found");
                    res.end("Not found");
                }
            }
        },
        start : function ()
        {
            var port = process.env.PORT;
            if (!port) port = 8080;
            var server = this;
            httpModule.createServer(function(req, res) { return server.handleRequests(req, res); }).listen(port)
            console.log("Crated http server at " + port);
        }
    };
    server.initTemplateLoaders();
    return server;
}

var server = new TicTacToeServer();
server.start();
