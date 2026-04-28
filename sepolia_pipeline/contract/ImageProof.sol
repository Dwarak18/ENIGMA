// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title ImageProof
 * @dev Stores and retrieves hashes for image verification on the blockchain.
 */
contract ImageProof {
    // Array to store SHA-256 hashes (32 bytes)
    bytes32[] public imageHashes;

    // Event emitted when a new hash is stored
    event HashStored(address indexed storer, bytes32 indexed hash, uint256 index);

    /**
     * @dev Stores a 32-byte hash in the blockchain array.
     * @param _hash The SHA-256 hash of the encrypted image data and metadata.
     */
    function storeHash(bytes32 _hash) public {
        imageHashes.push(_hash);
        emit HashStored(msg.sender, _hash, imageHashes.length - 1);
    }

    /**
     * @dev Retrieves a stored hash by its index.
     * @param _index The index of the hash to retrieve.
     * @return The 32-byte hash.
     */
    function getHash(uint256 _index) public view returns (bytes32) {
        require(_index < imageHashes.length, "Index out of bounds");
        return imageHashes[_index];
    }

    /**
     * @dev Returns the total number of stored hashes.
     */
    function getHashCount() public view returns (uint256) {
        return imageHashes.length;
    }
}
