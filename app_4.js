var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var async = require('async');
var app = express();
var config = require('./config');
var cookie = require('cookie');
var session = require('express-session');
var mongoose = require('mongoose');
var users = require('./routes/users');
var UserModel = require('./Dao/user');
var MongoStore = require('connect-mongo')(session);
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
//连接数据库
mongoose.connect(config.dbPath, function onMongooseError(err) {
    if (err) throw err;
});
var sessionStore = new MongoStore({
    url: 'mongodb://localhost/technode'
});
app.use(session({
    secret: 'technode',
    cookie: {
        maxAge: 60 * 1000
    },
    store:sessionStore,
    resave: true,
    saveUninitialized: true
}));
app.use('/users', users);

app.get('/',function (req, res) {
    res.sendfile('./static/index.html')
});


var io= require("socket.io").listen(app.listen(8000));
io.set('authorization', function(handshakeData, accept) {
     var cookies = cookie.parse(handshakeData.headers.cookie);
     var connectSid = cookies['connect.sid'];
     if(connectSid){
     var connected = cookieParser.signedCookie(connectSid, 'technode');
     if(connected){
     sessionStore.get(connected, function (error, session) {
     if (error) {
     accept(error.message, false)
     } else {
     handshakeData.headers.sessions  = session;
     if (session.user) {
     accept(null, true)
     } else {
     accept('No login')
         }
     }
     })
 }else {
    accept('No session')
    }
 }

 });
var SYSTEM = {
    account: '机器人'
}
var messages = [];
io.sockets.on('connection', function (socket) {
    socket.on('init', function () {
        socket.emit('init', messages);
        console.log("init");
        if(socket.handshake.headers.sessions!=null){
            var user = socket.handshake.headers.sessions.user;
            socket.broadcast.emit('messages.add',{
                content: user.account + '进入了聊天室',
                creator: SYSTEM,
                createAt: new Date()
            });
            UserModel.modify({account:user.account},{status:1},function(err,doc){
                UserModel.User.find({status:1},{account:1}, function (err,doc) {
                    if(doc){
                        io.sockets.emit('users.init', doc);
                    }
                });
            });

        }
    });
    socket.on('messages.read', function () {
        socket.emit('messages.read', messages);
        console.log("read");
    })
    socket.on('messages.create', function (message) {
        messages.push(message);
        io.sockets.emit('messages.add', message);
    });
    socket.on('disconnect', function() {
        if(socket.handshake.headers.sessions!=null) {
            var user = socket.handshake.headers.sessions.user;
            UserModel.modify({account: user.account}, {status: 0}, function (err, doc) {
                if (doc != null) {
                    console.log(doc.account + " has disconnect");
                }
            });
            socket.broadcast.emit('users.remove', user);
        }
    });
});

console.log("TechNode  is on port 8000!")
