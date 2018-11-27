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

    var file_path = file_folder + '/' + file_name;

    var input = {};
    input[file_name] = fs.readFileSync(file_path, 'utf8');

    var bytecode_from_compiler;
    var bytecode_from_blockchain;

    solc.loadRemoteVersion(solc_version, function (err, solc_specific) {
        if (!err) {
            // if solc successfully loaded, compile the contract and get the JSON output
            var output = JSON.parse(solc_specific.lowlevel.compileMulti(JSON.stringify({ sources: input }), is_optimized));

            // get bytecode from JSON output
            var bytecode = output['contracts'][file_name + ':' + contract_name]['runtimeBytecode'];

            if (parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[0].slice(1)) >= 4
                && parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[1].slice(1)) >= 7) {
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
                // construct the actual deployed bytecode
                bytecode_from_compiler = '0x' + bytecode.slice(starting_point, ending_point);
                // testify with result from blockchain until the compile finishes.
                testify_with_blochchain(solc_version);
            }
            else {
                bytecode_from_compiler = '0x' + bytecode;
                // testify with result from blockchain until the compile finishes.
                testify_with_blochchain(solc_version);
            }
        } else {
            console.error('Problem loading Solc version')
            process.exit(1)
        }
    });

    function testify_with_blochchain(solc_version) {
        // using web3 getCode function to read from blockchain
        web3.eth.getCode(contract_address)
            .then(output => {
                if (parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[0].slice(1)) >= 4
                    && parseInt(solc_version.match(/v\d+?\.\d+?\.\d+?[+-]/gi)[0].match(/\.\d+/g)[1].slice(1)) >= 7) {
                    // code stored at the contract address has no constructor or contract creation bytecode,
                    // only with swarm metadata appending at the back, therefore to get the actual deployed bytecode,
                    // just slice out the trailing swarm metadata.
                    var ending_point = output.search('a165627a7a72305820');

                    var swarm_hash_full = output.slice(output.lastIndexOf("a165627a7a72305820"), -4);
                    var swarm_hash = swarm_hash_full.slice(18);

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
