// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { USDCareProviderRegistry } from "./USDCareProviderRegistry.sol";

/// @notice Direct native-USDC settlement for an immutable invoice reference.
contract USDCarePaymentRouter is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    IERC20 public immutable USDC;
    USDCareProviderRegistry public immutable PROVIDER_REGISTRY;
    mapping(bytes32 invoiceReference => bool paid) public paidInvoice;

    event PaymentSettled(
        bytes32 indexed invoiceReference, address indexed payer, address indexed provider, uint256 amount
    );

    constructor(IERC20 usdcToken, USDCareProviderRegistry registry, address admin) {
        require(address(usdcToken) != address(0), "token is zero");
        require(address(registry) != address(0), "registry is zero");
        require(admin != address(0), "admin is zero");
        USDC = usdcToken;
        PROVIDER_REGISTRY = registry;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function pause() external onlyRole(OPERATOR_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(OPERATOR_ROLE) {
        _unpause();
    }

    function pay(bytes32 invoiceReference, address provider, uint256 amount) external whenNotPaused nonReentrant {
        require(invoiceReference != bytes32(0), "invoice reference is zero");
        require(!paidInvoice[invoiceReference], "invoice already paid");
        require(PROVIDER_REGISTRY.verifiedProvider(provider), "provider is not verified");
        require(amount > 0, "amount is zero");

        paidInvoice[invoiceReference] = true;
        USDC.safeTransferFrom(msg.sender, provider, amount);
        emit PaymentSettled(invoiceReference, msg.sender, provider, amount);
    }
}
