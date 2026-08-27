// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { USDCareProviderRegistry } from "./USDCareProviderRegistry.sol";

/// @notice Milestone escrow for provider-verified healthcare delivery.
contract USDCareTreatmentEscrow is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    uint8 public constant PROVIDER_ONLY = 0;
    uint8 public constant PROVIDER_AND_PATIENT = 1;

    enum Status {
        CREATED,
        FUNDED,
        COMPLETED,
        CANCELLED
    }

    struct Escrow {
        address payer;
        address provider;
        address patientApprover;
        uint128 totalAmount;
        uint128 releasedAmount;
        uint32 nextMilestone;
        uint32 milestoneCount;
        uint8 approvalPolicy;
        Status status;
        bool cancellationRequested;
        bool cancellationApproved;
    }

    struct Milestone {
        uint128 amount;
        bool providerApproved;
        bool patientApproved;
    }

    IERC20 public immutable USDC;
    USDCareProviderRegistry public immutable PROVIDER_REGISTRY;
    uint256 public nextEscrowId = 1;
    mapping(uint256 escrowId => Escrow escrow) public escrows;
    mapping(uint256 escrowId => mapping(uint256 milestoneId => Milestone milestone)) public milestones;

    event EscrowCreated(
        uint256 indexed escrowId,
        address indexed payer,
        address indexed provider,
        uint256 totalAmount,
        uint8 approvalPolicy
    );
    event EscrowFunded(uint256 indexed escrowId, address indexed payer, uint256 amount);
    event MilestoneApproved(uint256 indexed escrowId, uint256 indexed milestoneId, address indexed approver);
    event MilestoneReleased(uint256 indexed escrowId, uint256 indexed milestoneId, uint256 amount);
    event CancellationRequested(uint256 indexed escrowId);
    event CancellationApproved(uint256 indexed escrowId, address indexed provider);
    event EscrowRefunded(uint256 indexed escrowId, address indexed payer, uint256 amount);

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

    function createEscrow(address provider, address patientApprover, uint8 approvalPolicy, uint128[] calldata amounts)
        external
        whenNotPaused
        returns (uint256 escrowId)
    {
        require(PROVIDER_REGISTRY.verifiedProvider(provider), "provider is not verified");
        require(amounts.length > 0 && amounts.length <= 64, "invalid milestones");
        require(approvalPolicy <= PROVIDER_AND_PATIENT, "invalid approval policy");
        if (approvalPolicy == PROVIDER_AND_PATIENT) require(patientApprover != address(0), "patient is zero");

        uint128 total;
        escrowId = nextEscrowId++;
        for (uint256 i; i < amounts.length; ++i) {
            require(amounts[i] > 0, "milestone is zero");
            total += amounts[i];
            milestones[escrowId][i] = Milestone({ amount: amounts[i], providerApproved: false, patientApproved: false });
        }
        escrows[escrowId] = Escrow({
            payer: msg.sender,
            provider: provider,
            patientApprover: patientApprover,
            totalAmount: total,
            releasedAmount: 0,
            nextMilestone: 0,
            milestoneCount: uint32(amounts.length),
            approvalPolicy: approvalPolicy,
            status: Status.CREATED,
            cancellationRequested: false,
            cancellationApproved: false
        });
        emit EscrowCreated(escrowId, msg.sender, provider, total, approvalPolicy);
    }

    function fundEscrow(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.payer == msg.sender, "only payer");
        require(escrow.status == Status.CREATED, "not fundable");
        escrow.status = Status.FUNDED;
        USDC.safeTransferFrom(msg.sender, address(this), escrow.totalAmount);
        emit EscrowFunded(escrowId, msg.sender, escrow.totalAmount);
    }

    function approveMilestone(uint256 escrowId, uint256 milestoneId) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.FUNDED, "not active");
        require(milestoneId == escrow.nextMilestone, "not current milestone");
        Milestone storage milestone = milestones[escrowId][milestoneId];
        if (msg.sender == escrow.provider) {
            milestone.providerApproved = true;
        } else if (msg.sender == escrow.patientApprover && escrow.approvalPolicy == PROVIDER_AND_PATIENT) {
            milestone.patientApproved = true;
        } else {
            revert("not an approver");
        }
        emit MilestoneApproved(escrowId, milestoneId, msg.sender);
    }

    function releaseMilestone(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.status == Status.FUNDED, "not active");
        uint256 milestoneId = escrow.nextMilestone;
        Milestone storage milestone = milestones[escrowId][milestoneId];
        require(milestone.providerApproved, "provider approval required");
        if (escrow.approvalPolicy == PROVIDER_AND_PATIENT) {
            require(milestone.patientApproved, "patient approval required");
        }

        uint128 amount = milestone.amount;
        escrow.releasedAmount += amount;
        escrow.nextMilestone += 1;
        if (escrow.nextMilestone == escrow.milestoneCount) escrow.status = Status.COMPLETED;
        USDC.safeTransfer(escrow.provider, amount);
        emit MilestoneReleased(escrowId, milestoneId, amount);
    }

    function requestCancellation(uint256 escrowId) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.payer == msg.sender, "only payer");
        require(escrow.status == Status.CREATED || escrow.status == Status.FUNDED, "not cancellable");
        escrow.cancellationRequested = true;
        emit CancellationRequested(escrowId);
    }

    function refund(uint256 escrowId) external whenNotPaused nonReentrant {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.payer == msg.sender || escrow.provider == msg.sender, "not authorized");
        require(escrow.cancellationRequested, "cancellation not requested");
        require(escrow.status == Status.CREATED || escrow.status == Status.FUNDED, "not refundable");
        if (escrow.status == Status.FUNDED) require(escrow.cancellationApproved, "provider approval required");

        uint256 amount;
        if (escrow.status == Status.FUNDED) {
            amount = uint256(escrow.totalAmount) - escrow.releasedAmount;
            if (amount > 0) USDC.safeTransfer(escrow.payer, amount);
        }
        escrow.status = Status.CANCELLED;
        emit EscrowRefunded(escrowId, escrow.payer, amount);
    }

    function approveCancellation(uint256 escrowId) external whenNotPaused {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.provider == msg.sender, "only provider");
        require(escrow.status == Status.FUNDED, "not active");
        require(escrow.cancellationRequested, "cancellation not requested");
        escrow.cancellationApproved = true;
        emit CancellationApproved(escrowId, msg.sender);
    }
}
