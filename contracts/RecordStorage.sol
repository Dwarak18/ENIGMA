// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RecordStorage
 * @dev Secure immutable anchor for ENIGMA / ARGUS entropy records with verification.
 * 
 * SECURITY FEATURES:
 * - Stores immutable hash anchors (not raw data)
 * - Prevents record overwriting (idempotency)
 * - Verification function to prove integrity
 * - Blockchain block number for tamper-proofing
 */
contract RecordStorage {
    struct AnchorRecord {
        string deviceId;
        uint256 timestamp;
        bytes32 integrityHash;        // SECURITY FIX: Use bytes32 for hash instead of string
        uint256 blockNumber;
        bool verified;                 // Track verification status
    }

    // Mapping from record identifier (deviceId + timestamp string) to AnchorRecord
    mapping(string => AnchorRecord) public records;
    string[] public recordIds;

    // Events for blockchain history tracking
    event RecordAnchored(
        string indexed deviceId,
        uint256 indexed timestamp,
        bytes32 indexed integrityHash,
        uint256 blockNumber
    );
    
    event RecordVerified(
        string indexed recordKey,
        bytes32 integrityHash,
        bool isValid
    );

    /**
     * @dev Anchors a single entropy record to the blockchain.
     * @param deviceId Identifier of the source hardware.
     * @param timestamp Hardware-derived Unix timestamp.
     * @param integrityHashHex The SHA-256 integrity hash (hex string from backend).
     * 
     * SECURITY:
     * - Hash is computed as: SHA256(aes_key_hash || frame_id || sntp_time)
     * - Cannot be spoofed as it includes cryptographic commitment to entropy key
     * - Block number proves immutability (cannot be changed after inclusion)
     */
    function storeRecord(
        string calldata deviceId,
        uint256 timestamp,
        string calldata integrityHashHex
    ) external {
        string memory recordKey = string(abi.encodePacked(deviceId, "_", uint2str(timestamp)));
        
        // Prevent overwriting existing records (replay attack protection)
        require(records[recordKey].timestamp == 0, "Record already anchored");

        // Convert hex string to bytes32 hash
        bytes32 integrityHash = hexStringToBytes32(integrityHashHex);

        records[recordKey] = AnchorRecord({
            deviceId: deviceId,
            timestamp: timestamp,
            integrityHash: integrityHash,
            blockNumber: block.number,
            verified: false
        });

        recordIds.push(recordKey);

        emit RecordAnchored(deviceId, timestamp, integrityHash, block.number);
    }

    /**
     * @dev Verify a stored record's integrity
     * This allows external systems to prove that a record matches the blockchain anchor
     * 
     * @param recordKey Unique identifier for the record (deviceId_timestamp)
     * @param expectedHash The integrity hash to verify against
     * @return isValid True if the record exists and hash matches
     */
    function verifyRecord(string calldata recordKey, bytes32 expectedHash)
        external
        returns (bool isValid)
    {
        require(records[recordKey].timestamp != 0, "Record not found");

        isValid = records[recordKey].integrityHash == expectedHash;
        records[recordKey].verified = isValid;

        emit RecordVerified(recordKey, expectedHash, isValid);
        return isValid;
    }

    /**
     * @dev Retrieve a record's integrity hash for verification
     * @param recordKey Unique identifier for the record
     * @return integrityHash The stored integrity hash (bytes32)
     */
    function getRecordHash(string calldata recordKey)
        external
        view
        returns (bytes32 integrityHash)
    {
        require(records[recordKey].timestamp != 0, "Record not found");
        return records[recordKey].integrityHash;
    }

    /**
     * @dev Get total count of anchored records
     */
    function getRecordCount() external view returns (uint256) {
        return recordIds.length;
    }

    /**
     * @dev Check if a record has been verified
     */
    function isRecordVerified(string calldata recordKey)
        external
        view
        returns (bool)
    {
        return records[recordKey].verified;
    }

    /**
     * @dev Convert hex string (64 chars for SHA-256) to bytes32
     * Example: "abc123..." -> 0xabc123...
     */
    function hexStringToBytes32(string calldata hexString)
        internal
        pure
        returns (bytes32)
    {
        bytes memory hexBytes = bytes(hexString);
        require(hexBytes.length == 64, "Invalid hex string length (expected 64 chars)");

        uint256 result = 0;
        for (uint256 i = 0; i < 64; i++) {
            uint256 c = uint256(uint8(hexBytes[i]));
            uint256 digit;

            if (c >= 48 && c <= 57) {
                // 0-9
                digit = c - 48;
            } else if (c >= 97 && c <= 102) {
                // a-f
                digit = c - 87;
            } else if (c >= 65 && c <= 70) {
                // A-F
                digit = c - 55;
            } else {
                revert("Invalid hex character");
            }

            result = (result << 4) | digit;
        }

        return bytes32(result);
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
