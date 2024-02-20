const fs = require('fs')
const checkFile = (filename) => new Promise((resolve, reject) => {
    const timeout = 2000
    const interval_stated = 100
    const threshold = timeout/interval_stated
    let cntr = 0
    const interval = setInterval(() => {
        if(fs.existsSync(filename) && fs.statSync(filename).size !== 0){
            clearInterval(interval);
            resolve()
        }
        else if(cntr <= threshold){cntr++;}
        else{
            clearInterval(interval);
            reject(new Error(`${filename} was not created.`)) 
        }
    }, interval_stated)
})

exports.fileCat = function(file1, file2, callback) {
    this.SEPARATOR = ' '    
    Promise.all([checkFile(file1).catch((error) => error), checkFile(file2).catch((error) => error)])
    .then((value) => {
        if(!value[0] && !value[1]){
            let final_data = fs.readFileSync(file1) + this.SEPARATOR + fs.readFileSync(file2);
            callback(null, final_data);
        }
        if(!value[0] && value[1]){callback(new Error('file2 not exist'), null);}
        if(value[0] && !value[1]){callback(new Error('file1 not exist'), null);}
        if(value[0] && value[1]){callback(new Error('file1 and file2 not exist'), null);}
    });
}
