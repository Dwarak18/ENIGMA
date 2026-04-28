// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RecordStorage
 * @dev Secure immutable anchor for ENIGMA / ARGUS entropy records.
 */
contract RecordStorage {
    struct AnchorRecord {
        string deviceId;
        uint256 timestamp;
        string entropyHash;
        uint256 blockNumber;
    }

    // Mapping from record identifier (deviceId + timestamp string) to AnchorRecord
    mapping(string => AnchorRecord) public records;
    string[] public recordIds;

    event RecordAnchored(string indexed deviceId, uint256 indexed timestamp, string entropyHash, uint256 blockNumber);

    /**
     * @dev Anchors a single entropy record to the blockchain.
     * @param deviceId Identifier of the source hardware.
     * @param timestamp Hardware-derived Unix timestamp.
     * @param entropyHash The SHA-256 entropy hash.
     */
    function storeRecord(string calldata deviceId, uint256 timestamp, string calldata entropyHash) external {
        string memory recordKey = string(abi.encodePacked(deviceId, "_", uint2str(timestamp)));
        
        // Ensure we don't overwrite existing records (idempotency)
        require(records[recordKey].timestamp == 0, "Record already anchored");

        records[recordKey] = AnchorRecord({
            deviceId: deviceId,
            timestamp: timestamp,
            entropyHash: entropyHash,
            blockNumber: block.number
        });

        recordIds.push(recordKey);

        emit RecordAnchored(deviceId, timestamp, entropyHash, block.number);
    }

    function getRecordCount() external view returns (uint256) {
        return recordIds.length;
    }

    /**
     * @dev Internal helper to convert uint to string for key generation.
     */
    function uint2str(uint256 _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }
}
