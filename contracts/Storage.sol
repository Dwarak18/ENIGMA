// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Storage {
    string public data;

    event DataStored(string newData);

    function setData(string memory _data) public {
        data = _data;
        emit DataStored(_data);
    }

    function getData() public view returns (string memory) {
        return data;
    }
}
