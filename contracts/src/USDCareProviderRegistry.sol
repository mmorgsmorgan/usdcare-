// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";

/// @notice Allowlist of provider settlement addresses controlled by USDCare operations.
contract USDCareProviderRegistry is AccessControl {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    mapping(address provider => bool verified) public verifiedProvider;

    event ProviderVerificationUpdated(address indexed provider, bool verified);

    constructor(address admin) {
        require(admin != address(0), "admin is zero");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function setProvider(address provider, bool verified) external onlyRole(OPERATOR_ROLE) {
        require(provider != address(0), "provider is zero");
        verifiedProvider[provider] = verified;
        emit ProviderVerificationUpdated(provider, verified);
    }
}
