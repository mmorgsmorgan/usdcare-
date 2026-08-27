// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import { Script } from "forge-std/Script.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { USDCareProviderRegistry } from "../src/USDCareProviderRegistry.sol";
import { USDCarePaymentRouter } from "../src/USDCarePaymentRouter.sol";
import { USDCareTreatmentEscrow } from "../src/USDCareTreatmentEscrow.sol";
import { USDCareTreatmentEscrowV2 } from "../src/USDCareTreatmentEscrowV2.sol";

contract Deploy is Script {
    function run()
        external
        returns (USDCareProviderRegistry registry, USDCarePaymentRouter router, USDCareTreatmentEscrow escrow, USDCareTreatmentEscrowV2 escrowV2)
    {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.envOr("USCARE_ADMIN_ADDRESS", vm.addr(deployerKey));
        address usdc = vm.envAddress("USDC_TOKEN_ADDRESS");

        vm.startBroadcast(deployerKey);
        registry = new USDCareProviderRegistry(admin);
        router = new USDCarePaymentRouter(IERC20(usdc), registry, admin);
        escrow = new USDCareTreatmentEscrow(IERC20(usdc), registry, admin);
        escrowV2 = new USDCareTreatmentEscrowV2(IERC20(usdc), admin);
        vm.stopBroadcast();
    }
}
