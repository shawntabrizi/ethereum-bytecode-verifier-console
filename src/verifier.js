const solc = require('solc');
const Web3 = require('web3');
const fs = require('fs');

const verifier = (settings, provider) => {
    var web3 = new Web3(new Web3.providers.HttpProvider(provider));
    let solc_version = settings['solc_version'];
    let file_name = settings['file_name'];
    let contract_name = settings['contract_name'];
    let contract_address = settings['contract_address'];
    let is_optimized = settings['is_optimized'];
    let file_folder = settings['file_folder'];

    var input = {};

    // Load all solidity files to handle imports
    fs.readdir(file_folder, function(err, items) {
        if (err) {
            console.error("Problem opening directory: " + file_folder);
            process.exit(403);
        }
        for (item in items) {
            let file = items[item];
            if (file.slice(-4) == ".sol") {
                let file_path = file_folder + '/' + file;
                try {
                    input[file] = fs.readFileSync(file_path, 'utf8');
                } catch (err) {
                    console.error('Problem reading directory or files');
                    process.exit(404)
                }
            }
        }
    })

    var bytecode_from_compiler;
    var bytecode_from_blockchain;

    // Semantic versioning
    let solc_major = parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/v\d+/g)[0].slice(1))
    let solc_minor = parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[0].slice(1))
    let solc_patch = parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[1].slice(1))

    solc.loadRemoteVersion(solc_version, function (err, solc_specific) {
        if (!err) {
            // if solc successfully loaded, compile the contract and get the JSON output
            var output = JSON.parse(solc_specific.lowlevel.compileMulti(JSON.stringify({ sources: input }), is_optimized));

            // get bytecode from JSON output
            var bytecode = output['contracts'][file_name + ':' + contract_name]['runtimeBytecode'];
            
            var fixed_bytecode;

            if (solc_minor >= 4 && solc_patch >= 22) {
                // if solc version is at least 0.4.22, initial bytecode has 6080... instead of 6060...
                var starting_point = bytecode.lastIndexOf('6080604052');
                // a165627a7a72305820 is a fixed prefix of swarm info that was appended to contract bytecode
                // the beginning of swarm_info is always the ending point of the actual contract bytecode
                var ending_point = bytecode.search('a165627a7a72305820');

                fixed_bytecode = bytecode.slice(starting_point, ending_point);
            } else if (solc_minor >= 4 && solc_patch >= 7) {
                // if solc version is at least 0.4.7, then swarm hash is included into the bytecode.
                // every bytecode starts with a fixed opcode: "PUSH1 0x60 PUSH1 0x40 MSTORE"
                // which is 6060604052 in bytecode whose length is 10
                // var fixed_prefix= bytecode.slice(0,10);

                // every bytecode from compiler may or may not have constructor bytecode inserted before
                // actual deployed code (since constructor is optional).So there might be multiple matching
                // prefix of "6060604052", and actual deployed code starts at the last such pattern.
                var starting_point = bytecode.lastIndexOf('6060604052');
                // a165627a7a72305820 is a fixed prefix of swarm info that was appended to contract bytecode
                // the beginning of swarm_info is always the ending point of the actual contract bytecode
                var ending_point = bytecode.search('a165627a7a72305820');

                fixed_bytecode = bytecode.slice(starting_point, ending_point);
            }
            else {
                fixed_bytecode =  bytecode;
            }
            // construct actual bytecode
            bytecode_from_compiler = '0x' + fixed_bytecode;
            // testify with result from blockchain until the compile finishes.
            testify_with_blochchain();

        } else {
            console.error('Problem loading Solc version')
            process.exit(1)
        }
    });

    function testify_with_blochchain() {
        // using web3 getCode function to read from blockchain
        web3.eth.getCode(contract_address)
            .then(output => {
                if (solc_minor >= 4 && solc_patch >= 7) {
                    // code stored at the contract address has no constructor or contract creation bytecode,
                    // only with swarm metadata appending at the back, therefore to get the actual deployed bytecode,
                    // just slice out the trailing swarm metadata.
                    var ending_point = output.search('a165627a7a72305820');
                    bytecode_from_blockchain = output.slice(0, ending_point);
                } else {
                    // if the solc version is less than 0.4.7, then just directly compared the two.
                    bytecode_from_blockchain = output;
                }

                // checking bytecode
                if (bytecode_from_blockchain == bytecode_from_compiler) {
                    fs.writeFileSync('verified_deployed_bytecode.txt', bytecode_from_blockchain, 'utf-8');
                    console.log('Contract is verified!')
                    process.exit(0)
                }
                else {
                    fs.writeFileSync('from_blockchain.txt', bytecode_from_blockchain, 'utf-8');
                    fs.writeFileSync('from_compiler.txt', bytecode_from_compiler, 'utf-8');
                    console.log('Contract does not match')
                    process.exit(2)
                }
            });
    }

};

module.exports = { verifier };
