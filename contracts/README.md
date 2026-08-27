# USDCare Contracts

Arc Testnet deployment target: chain ID `5042002` (`eip155:5042002`).

Contracts:

- `USDCareProviderRegistry`: allowlists provider settlement addresses.
- `USDCarePaymentRouter`: settles each invoice reference once by transferring USDC directly from payer to a verified provider.
- `USDCareTreatmentEscrow`: legacy escrow with one payer.
- `USDCareTreatmentEscrowV2`: provider-created care plans with multiple allowlisted payer wallets, partial funding, evidence submission, payer confirmations, and milestone release.

## Verify locally

```bash
forge test
forge build
```

## Deploy

Copy `.env.example` to a secret environment file, set `DEPLOYER_PRIVATE_KEY`, `USDC_TOKEN_ADDRESS`, and optionally `USCARE_ADMIN_ADDRESS`, then run:

```bash
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --chain-id 5042002 \
  --broadcast
```

Do not use a Privy recovery phrase or store private keys in the repository. For production, use a dedicated deployment signer and transfer administration to a controlled multisig or Privy-authorized operations wallet.
