'use strict';

const { MongoClient } = require('mongodb');
const fs = require('fs');
const express = require('express');
const { graphqlHTTP } = require('express-graphql');
const { assertResolversPresent, makeExecutableSchema } = require('@graphql-tools/schema');

const app = express();
const MONGO_CONFIG_FILE = './config/mongo.json';
const PORT = 3000;

const enum_handed_response = {
    L: 'left',
    R: 'right',
    A: 'ambi'
};

const enum_handed_file = {
    left: 'L',
    right: 'R',
    ambi: 'A'
};

const kErrors = {
    kNotFoundError: class kNotFoundError extends Error {},
    kInActiveMatch: class kInActiveMatch extends Error {},
    kInsufficientFunds: class kInsufficientFunds extends Error {},
    kMatchNotActive: class kMatchNotActive extends Error {}
};

function check_valid_config(configfile) {
    try {
        JSON.parse(fs.readFileSync(configfile));
    } catch {
        return false;
    }
    return true;
}

if (!check_valid_config(MONGO_CONFIG_FILE)) {
    process.exit(2);
}

let client = (async function (configfile = MONGO_CONFIG_FILE) {
    let config = {
        host: '127.0.0.1',
        port: '27017',
        db: 'ee547_hw',
        opts: {
            useUnifiedTopology: true
        }
    };

    try {
        let con_fig = require(configfile);
        config = { ...config, ...con_fig };
    } catch (err) {
        console.error(err);
    }

    let uri = `mongodb://${config.host}:${config.port}`;

    // Create a new MongoClient, set it as a member variable, and establish the connection
    let client = new MongoClient(uri, config.opts);

    try {
        await client.connect();
        // console.log("Connection to the database established!");
    } catch {
        process.exit(5);
    }

    // Set the database as a member variable
let db = client.db(config.db);

const typeDefs = `type Query {
    player(pid: ID!): Player
    
    players(
        limit:  Int
        offset: Int
        sort:   String 
    ): [Player]!
    
    match(mid:    ID!): Match
    
    matches(
        limit:  Int
        offset: Int
        sort:   String 
    ): [Match]!
    }
    
    type Mutation {
    matchAward(
        mid:    ID!
        pid:    ID!
        points: Int!
    ): Match
    
    matchCreate(
        pid1:                ID!
        pid2:                ID!
        entry_fee_usd_cents: Int!
        prize_usd_cents:     Int!
    ): Match
    
    matchDisqualify(
        mid: ID!
        pid: ID!
    ): Match
    
    matchEnd(
        mid: ID!
    ): Match
    
    playerCreate(
        playerInput: PlayerCreateInput
    ): Player
    
    playerDelete(pid: ID!): Boolean
    
    playerDeposit(
        pid:              ID!
        amount_usd_cents: Int!
    ): Player
    
    playerUpdate(
        pid:         ID!
        playerInput: PlayerUpdateInput
    ): Player
    }
    
    enum HandedEnum {
    ambi
    left
    right
    }
    
    input PlayerCreateInput {
    fname:                     String!
    handed:                    HandedEnum
    initial_balance_usd_cents: Int!
    lname:                     String
    }
    
    input PlayerUpdateInput {
    is_active: Boolean
    lname:     String
    }
    
    type Player {
    balance_usd_cents:     Int
    efficiency:            Float
    fname:                 String
    handed:                HandedEnum
    in_active_match:       Match
    is_active:             Boolean
    lname:                 String
    name:                  String
    num_dq:                Int
    num_join:              Int
    num_won:               Int
    pid:                   ID!
    total_points:          Int
    total_prize_usd_cents: Int
    }
    
    type Match {
    age:                 Int
    ended_at:            String
    entry_fee_usd_cents: Int
    is_active:           Boolean
    is_dq:               Boolean
    mid:                 ID!
    p1:                  Player!
    p1_points:           Int
    p2:                  Player!
    p2_points:           Int
    prize_usd_cents:     Int
    winner:              Player
    }`;

    const schema = makeExecutableSchema({
        resolvers,
        resolverValidationOptions: {
            requireResolversForAllFields: 'warn',
            requireResolversToMatchSchema: 'warn'
        },
        typeDefs
    });

    app.get('/ping', (req, res) => {
        res.sendStatus(204);
    });

    const expressPlayground = require('graphql-playground-middleware-express').default;

    app.use('/graphql', expressPlayground({ endpoint: '/graphql' }));

    app.listen(PORT);
    console.log('GraphQL API server running at http://localhost:3000/graphql');

    return client;
})();

class Decorator{
    static formatPlayer(player){
        if (player == null) {
            return null;
        }

        // Check if input is an array
        if (Array.isArray(player)) {
            return player.map(Decorator.formatPlayer);
        }
        else {
            let dict = {
                pid: player._id,
                fname: player.fname,
                lname: player.lname,
                name: `${player.fname}${player.lname ? ` ${player.lname}`:''}`,
                handed: enum_handed_response[player.handed],
                is_active: player.is_active,
                balance_usd_cents: player.balance_usd_cents,
                num_join: player.num_join ? player.num_join : 0,
                num_won: player.num_won ? player.num_won : 0,
                num_dq: player.num_dq ? player.num_dq : 0,
                total_points: player.total_points ? player.total_points : 0,
                total_prize_usd_cents: player.total_prize_usd_cents ? player.total_prize_usd_cents : 0,
                in_active_match: player.in_active_match ? player.in_active_match : null,
                efficiency: (player.num_join > 0) ? (player.num_won/player.num_join) : 0
            }
            return dict;
        } 
    }

    static formatMatch(match){
        if (match == null) {
            return null;
        }

        if (Array.isArray(match)) {
            return match.map(Decorator.formatMatch);   //SHOULD THERE BE A THIS HERE??     
        }
        else {
            let dict = Promise.all([
                client.db.collection('player').findOne({_id:ObjectId(match.p1_id)}),
                client.db.collection('player').findOne({_id:ObjectId(match.p2_id)})
            ]).then((values) => {
                dict = {
                    age: Math.floor((new Date() - match.created_at)/1000),
                    ended_at: match?.ended_at ? match.ended_at : null,
                    entry_fee_usd_cents: match.entry_fee_usd_cents,
                    is_active: match?.ended_at == null ? true:false,
                    is_dq: match?.is_dq ? match.is_dq : false,
                    mid: match._id,
                    p1: values[0],
                    p1_points: match?.p1_points ? match.p1_points : 0,
                    p2: values[1],
                    p2_points: match?.p2_points ? match.p2_points : 0,
                    prize_usd_cents: match.prize_usd_cents,
                    winner: match?.ended_at ? (match.winner_pid == values[0].pid ? values[0] : values[1]) : null
                }
                return dict;
            })
            return dict;
        }
    }
}

const resolvers = {
    Query: {
        player: async (_, { pid }, context) => {
            const player = await context.loaders.player.load(pid);
            return Decorator.formatPlayer(player);
        },

        players: async (_, { limit, offset, sort }, context) => {
            let players;
            try {
                players = await context.db.collection('player').find({}).toArray();
                players = Decorator.formatPlayer(players);
                players.sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
            } finally {}

            return players.slice(offset, limit + offset).map(player => Decorator.formatPlayer(player));
        },

        match: async (_, { mid }, context) => {
            const match = await context.loaders.match.load(mid);
            return Decorator.formatMatch(match);
        },

        matches: async (_, { limit, offset, sort }, context) => {
            let res = [];
            let activeMatches = [];
            let inactiveMatches = [];

            try {
                activeMatches = await context.db.collection('match').find({ ended_at: null }).toArray();
                if (activeMatches.length > 0) {
                    activeMatches = await Decorator.formatMatch(activeMatches);
                    Promise.all(activeMatches).then((values) => {
                        values.sort((a, b) => (a.prize_usd_cents < b.prize_usd_cents ? 1 : a.prize_usd_cents > b.prize_usd_cents ? -1 : 0));
                        activeMatches = values;
                    });
                }

                inactiveMatches = await context.db.collection('match').find({ ended_at: { $ne: null } }).toArray();
                if (inactiveMatches.length > 0) {
                    inactiveMatches = await Decorator.formatMatch(inactiveMatches);
                    Promise.all(inactiveMatches).then((values) => {
                        values.sort((a, b) => (a.ended_at < b.ended_at ? 1 : a.ended_at > b.ended_at ? -1 : 0));
                        inactiveMatches = values;
                    });
                }

                res = [...activeMatches, ...inactiveMatches.slice(0, 4)].map(match => Decorator.formatMatch(match));
            } finally {}

            return res;
        },
    },
    Mutation: {
        matchAward: async(_, {mid, pid, points}, context) => {
            let player;
            let match;

            try {
                player = await context.db.collection('player').findOne({_id:ObjectId(pid)});
                match = await context.db.collection('match').findOne({_id:ObjectId(mid)});

                if (!match || !player) {
                    throw new kErrors.kNotFoundError();
                }
    
                if (match.ended_at != null) {
                    throw new kErrors.kMatchNotActive();
                }
    
                if (pid != match.p1_id && pid != match.p2_id) {  
                    throw new Error();
                }

                let match_update = {$inc:{
                    p1_points: pid == match.p1_id ? points : 0,
                    p2_points: pid == match.p2_id ? points : 0
                }}
    
                let player_update = {$inc:{
                    total_points: points
                }}

                // Update match
                await context.db.collection('match').updateOne({_id:ObjectId(mid)}, match_update);

                // Update player
                await context.db.collection('player').updateOne({_id:ObjectId(pid)}, player_update);
            }

        finally{}
        context.loaders.player.clear(pid);
        context.loaders.match.clear(mid);
        return context.loaders.match.load(mid);
        },

        matchCreate: async(_, {pid1, pid2, entry_fee_usd_cents, prize_usd_cents}, context) => {
            let res;
            let player1;
            let player2;
            // Check if the players exist

            try {
                player1 = await context.db.collection('player').findOne({_id:ObjectId(pid1)});
                player2 = await context.db.collection('player').findOne({_id:ObjectId(pid2)});
                if (!player1 || !player2) {
                    throw new kErrors.kNotFoundError();
                }
    
                // Check if the players are in an active match currently
                if (player1.in_active_match || player2.in_active_match) {
                    throw new kErrors.kInActiveMatch();
                }

                // Check if the players have sufficient funds
                if (player1.balance_usd_cents < entry_fee_usd_cents || 
                    player2.balance_usd_cents < entry_fee_usd_cents) {
                    throw new kErrors.kInsufficientFunds();
                }

                // Create the match if all the above conditions are satisfied
                let match = {
                    created_at: new Date(),
                    ended_at: null,
                    entry_fee_usd_cents: entry_fee_usd_cents,
                    is_dq: false,
                    p1_id: pid1,
                    p1_points: 0,
                    p2_id: pid2,
                    p2_points: 0,
                    prize_usd_cents: prize_usd_cents
                }
                // Insert the above document into the collection
                res = await context.db.collection('match').insertOne(match);

                // Update player's balance and match ID
                let update_dict = {
                    $inc:{balance_usd_cents:-1*match.entry_fee_usd_cents, num_join:1},       
                    $set:{in_active_match:res.insertedId}
                }

                await context.db.collection('player').updateOne({_id:ObjectId(match.p1_id)}, update_dict);
                await context.db.collection('player').updateOne({_id:ObjectId(match.p2_id)}, update_dict);

            }
            finally{}
            return context.loaders.match.load(res.insertedId);
        },

        matchDisqualify: async(_, {mid, pid}, context) => {
            let match;
            let player;

            try {
                match = await context.db.collection('match').findOne({_id:ObjectId(mid)});
                player = await context.db.collection('player').findOne({_id:ObjectId(pid)});
    
                if (!match || !player) {
                    throw new kErrors.kNotFoundError();
                }
    
                if (match.ended_at != null) {
                    throw new kErrors.kMatchNotActive();
                }
    
                if (pid != match.p1_id && pid != match.p2_id) {
                    throw new Error();
                }

                // Set the other player as the winner
                let winner_pid = pid == match.p1_id ? match.p2_id : match.p1_id;

                let match_update = {
                    $set: {ended_at: new Date(), winner_pid: ObjectId(winner_pid), is_dq:true} 
                }

                let player_update = {
                    $set: {in_active_match:null}
                }

                let winner_update = {
                    $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
                }

                let dq_update = {
                    $inc: {num_dq:1}
                }

                // Update the match
                await context.db.collection('match').updateOne({_id:ObjectId(mid)}, match_update);

                // Update all the players in the match
                await context.db.collection('player').updateMany({in_active_match:ObjectId(mid)}, player_update);

                // Update the winner
                await context.db.collection('player').updateOne({_id:ObjectId(winner_pid)}, winner_update);

                // Update the disqualified player
                await context.db.collection('player').updateOne({_id:ObjectId(pid)}, dq_update);
            }

            finally {}
            context.loaders.match.clear(mid);
            context.loaders.player.clear(pid);
            context.loaders.player.clear(winner_pid);
            return context.loaders.match.load(mid);
        },

        matchEnd: async(_, {mid}, context) => {
            let match;

            try {
                match = await context.db.collection('match').findOne({"_id":ObjectId(mid)});
                if (!match) {
                    throw new kErrors.kNotFoundError();
                }
    
                if (match.ended_at != null || match.p1_points === match.p2_points) {
                    throw new kErrors.kMatchNotActive();
                }
    
                let winner_pid = match.p1_points > match.p2_points ? match.p1_id : match.p2_id;
    
                let match_update = {
                    $set: {ended_at: new Date(), winner_pid: ObjectId(winner_pid)}
                }

                let player_update = {
                    $set: {in_active_match:null}
                }
    
                let winner_update = {
                    $inc: {num_won: 1, balance_usd_cents:match.prize_usd_cents, total_prize_usd_cents:match.prize_usd_cents}
                }

                // Update the match
                await context.db.collection('match').updateOne({_id:ObjectId(mid)}, match_update);

                // Update all the players in the match
                await context.db.collection('player').updateMany({in_active_match:ObjectId(mid)}, player_update)    

                // Update the winner
                await context.db.collection('player').updateOne({_id:ObjectId(winner_pid)}, winner_update)
            }

            finally {}
            context.loaders.match.clear(mid);
            context.loaders.player.clear(match.p1_id);
            context.loaders.player.clear(match.p2_id);
            return context.loaders.match.load(mid);
        },

        playerCreate: async(_, {playerInput:{fname, handed, initial_balance_usd_cents, lname}}, context) => {
            let res;
            let player_dict = {
                fname: fname,
                lname: lname,
                handed: enum_handed_file[handed],
                is_active: true,
                balance_usd_cents: initial_balance_usd_cents,
                created_at: new Date(),
                num_join: 0,
                num_won: 0,
                num_dq: 0,
                total_points: 0,
                total_prize_usd_cents: 0,
                in_active_match: null      
            };
            try {
                res = await context.db.collection('player').insertOne(player_dict);
            }
            finally {}
            return context.loaders.player.load(res.insertedId);   //or should we return by calling decorator.formal instead?
        },     

        playerDelete: async(_, {pid}, context) => {
            let deleted = false;
            let res;

            try {
                res = await context.db.collection('player').deleteOne({"_id":ObjectId(pid)});
                if(!res) {
                    throw new kErrors.kNotFoundError();
                }
                else if (res.deletedCount > 0) {
                    deleted = true;
                }
                else {
                    throw new kErrors.kNotFoundError();
                }
            }
            finally {}
            context.loaders.player.clear(pid);
            return deleted;
        },
        
        playerDeposit: async(_, {pid, amount_usd_cents}, context) => {
            let deposited = false;
            let res;
            let player;

            let update_dict = {$inc:{balance_usd_cents:amount_usd_cents}};

            try {
                player = await context.db.collection('player').findOne({"_id":ObjectId(pid)});

                if (player) {
                    res = await context.db.collection('player').updateOne({"_id":ObjectId(pid)}, update_dict);
                    if (res.matchedCount > 0) {
                        deposited = true;
                    }    
                }
                else {
                    throw new kErrors.kNotFoundError();
                }
            }
            finally {}
            context.loaders.player.clear(pid);
            return context.loaders.player.load(pid);
        },

        playerUpdate: async(_, {pid, playerInput:{is_active, lname}}, context) => {
            let res;
            let update_dict = {$set:{}};

            if (lname != null){
                update_dict.$set.lname = lname;
            }
            if (is_active != null){
                update_dict.$set.is_active = is_active;
            }

            try{
                res = await context.db.collection('player').updateOne({"_id":ObjectId(pid)}, update_dict);
                if (!(res.matchedCount > 0)) {
                    throw new kErrors.kNotFoundError();
                }
            }
            finally {}
            context.loaders.player.clear(pid);
            return context.loaders.player.load(pid);
        }
    },

    Player: {
        balance_usd_cents: ({balance_usd_cents}, _, context) => {
            return balance_usd_cents;
        },
        efficiency: ({num_won, num_join}, _, context) => {
            return (num_join > 0) ? (num_won/num_join) : 0;
        },
        fname: ({fname}, _, context) => {
            return fname;
        },
        handed: ({handed}, _, context) => {
            return enum_handed_response[handed];   
        },
        in_active_match: ({in_active_match}, _, context) => {
            return in_active_match ? in_active_match : null;
        },
        is_active: ({is_active}, _, context) => {
            return is_active;
        },
        lname: ({lname}, _, context) => {
            return lname;
        },
        name: ({fname, lname}, _, context) => {
            return (`${fname}${lname ? ` ${lname}`:''}`)
        },
        num_dq: ({num_dq}, _, context) => {
            return num_dq ? num_dq : 0;
        },
        num_join: ({num_join}, _, context) => {
            return num_join ? num_join : 0;
        },
        num_won: ({num_won}, _, context) => {
            return num_won ? num_won : 0;
        },
        pid: ({_id}, _, context) => {
            return _id;
        },
        total_points: ({total_points}, _, context) => {
            return total_points ? total_points : 0;
        },
        total_prize_usd_cents: ({total_prize_usd_cents}, _, context) => {
            return total_prize_usd_cents ? total_prize_usd_cents : 0;
        }
    },

    Match: {
        age: ({created_at}, _, context) => {
            return (Math.floor((new Date() - created_at)/1000));
        },
        ended_at: ({ended_at}, _, context) => {
            return ended_at ? ended_at : null;
        },
        entry_fee_usd_cents: ({entry_fee_usd_cents}, _, context) => {
            return entry_fee_usd_cents;
        },
        is_active: ({ended_at}, _, context) => {
            return ((ended_at == null) ? true : false);
        },
        is_dq: ({is_dq}, _, context) => {
            return is_dq ? is_dq : false;
        },
        mid: ({_id}, _, context) => {
            return _id;
        },
        p1: async({p1_id}, _, context) => {             //IS THIS CORRECT??
            let res = await client.db.collection('player').findOne({_id:ObjectId(p1_id)});
            if(!res){
                throw new kErrors.kNotFoundError();
            }
            return res;
        },
        p1_points: ({p1_points}, _, context) => {
            return p1_points ? p1_points : 0;
        },
        p2: async({p2_id}, _, context) => {
            let res = await client.db.collection('player').findOne({_id:ObjectId(p2_id)});
            if(!res){
                throw new kErrors.kNotFoundError();
            }
            return res;
        },
        p2_points: ({p2_points}, _, context) => {
            return p2_points ? p2_points : 0;
        },
        prize_usd_cents: ({prize_usd_cents}, _, context) => {
            return prize_usd_cents;
        },
        winner: ({ended_at, winner_pid, p1_id, p2_id}, _, context) => {
            let win = Promise.all([
                context.db.collection('player').findOne({_id:ObjectId(p1_id)}),
                context.db.collection('player').findOne({_id:ObjectId(p2_id)})
            ]).then((values) => {
                win = ended_at ? (winner_pid == values[0].pid ? values[0] : values[1]) : null
                return win;
            })
            return win;   //IS THIS CORRECT??
        }
    }
};

async function getPlayers(db, keys){
    keys = keys.map(key => ObjectId(key));
    let players = await db.collection('player').find({_id: {$in: keys}}).toArray();
    players = Decorator.formatPlayer(players);

    return keys.map(key => players.find(element => element.pid == key.toString()) || new Error(`Player ${key} doesn't exist`));
}

async function getMatches(db, keys){ //COMPLETE
    keys = keys.map(key => ObjectId(key));
    let matches = await db.collection('match').find({_id: {$in: keys}}).toArray();
    matches = Decorator.formatMatch(matches);

    return keys.map(key => matches.find(element => element.mid == key.toString())|| new Error(`Match ${key} doesn't exist`));
}

