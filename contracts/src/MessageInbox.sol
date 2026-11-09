// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MessageInbox {
    struct Message {
        address sender;
        bytes c1;
        bytes c2;
    }

    // Mapeia o endereço Ethereum da pessoa para a chave pública ElGamal dela
    mapping(address => bytes) public publicKeys;

    // Armazena as mensagens recebidas por cada endereço
    mapping(address => Message[]) public inboxes;

    event PublicKeyRegistered(address indexed user);
    event MessageSent(address indexed from, address indexed to);

    // 1. Usuário registra sua chave pública
    function registerPublicKey(bytes calldata pubKey) external {
        publicKeys[msg.sender] = pubKey;
        emit PublicKeyRegistered(msg.sender);
    }

    // 2. Outra pessoa envia a mensagem encriptada
    function sendMessage(address to, bytes calldata c1, bytes calldata c2) external {
        require(publicKeys[to].length > 0, "Recipient public key not found");

        inboxes[to].push(Message({
            sender: msg.sender,
            c1: c1,
            c2: c2
        }));

        emit MessageSent(msg.sender, to);
    }

    // 3. Usuário lê sua própria caixa de entrada
    function getMessages(address user) external view returns (Message[] memory) {
        return inboxes[user];
    }
}
