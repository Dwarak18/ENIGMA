// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RecordStorage {
    bytes32[] private storedHashes;

    event BatchStored(bytes32[] hashes, uint256 batchSize, uint256 totalStored);

    function storeBatch(bytes32[] calldata hashes) external {
        require(hashes.length > 0, "Empty batch");

        for (uint256 i = 0; i < hashes.length; i++) {
            storedHashes.push(hashes[i]);
        }

        emit BatchStored(hashes, hashes.length, storedHashes.length);
    }

    function totalHashes() external view returns (uint256) {
        return storedHashes.length;
    }

    function getHash(uint256 index) external view returns (bytes32) {
        require(index < storedHashes.length, "Index out of bounds");
        return storedHashes[index];
    }
}
