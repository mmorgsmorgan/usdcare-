"use client";

import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Bell,
  Building2,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Copy,
  ExternalLink,
  FileText,
  HeartPulse,
  HelpCircle,
  LayoutDashboard,
  Link2,
  LogOut,
  Menu,
  MoreHorizontal,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { usePrivy, useConnectWallet, useWallets } from "@privy-io/react-auth";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, decodeEventLog, encodeFunctionData, formatEther, http, keccak256, parseUnits, toHex, type Address } from "viem";
import escrowArtifact from "../contracts/USDCareTreatmentEscrow.json";
import escrowV2Artifact from "../contracts/USDCareTreatmentEscrowV2.json";

type AccountType = "individual" | "organization";
type WalletChoice = "embedded" | "external";
type OrganizationType = "hospital" | "clinic" | "diagnostic_centre" | "pharmacy" | "ngo" | "employer" | "insurer" | "other";
type NavView =
  | "overview"
  | "payments"
  | "invoices"
  | "escrows"
  | "patients"
  | "reports"
  | "settings"
  | "help";

type WalletSummary = {
  address: string;
  label: string;
  type: "embedded" | "external";
  verified: boolean;
};

type TransactionWallet = {
  address: string;
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<{ request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }>;
};

type OrganizationSummary = {
  id: string;
  name: string;
  type: string;
  verificationStatus: string;
  role: string;
  country?: string;
  address?: string;
  website?: string;
  contactEmail?: string;
  phone?: string;
  primaryWalletAddress?: string;
};

type AccountState = {
  userId: string;
  onboarded: boolean;
  accountType: AccountType | null;
  organizations: OrganizationSummary[];
};

type OnboardingInput = {
  accountType: AccountType;
  identityName?: string;
  email?: string;
  organization?: { name: string; type: OrganizationType; country?: string; address?: string; website?: string; contactEmail?: string; phone?: string };
  wallets: Array<{
    address: string;
    walletType: "embedded" | "external";
    chain: "eip155:5042002";
  }>;
  transactionWalletAddress: string;
  sharedWalletRiskAcknowledged: boolean;
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const arcChainId = 5_042_002;
const arcRpcUrl = "https://rpc.testnet.arc.io";
const arcPublicClient = createPublicClient({ transport: http(arcRpcUrl) });
const escrowAddress = "0xe12a385b431240bcb5dca741c44fb861b9e1431f" as Address;
const usdcAddress = "0x3600000000000000000000000000000000000000" as Address;
const escrowAbi = escrowArtifact.abi as readonly unknown[];
const escrowV2Address = (process.env.NEXT_PUBLIC_ESCROW_V2_ADDRESS ?? "") as Address;
const escrowV2Abi = escrowV2Artifact.abi as readonly unknown[];
const erc20ApproveAbi = [{ type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] }] as const;

const demoWallets: WalletSummary[] = [
  { address: "0x71C4F09DBD8829A20", label: "Built-in wallet", type: "embedded", verified: true },
  { address: "0x91A79233D80B310F", label: "Connected wallet", type: "external", verified: true },
];

const initialInvoices = [
  { id: "INV-2094", patient: "PAT-7210", service: "Cardiac screening", amount: "300.00", status: "Paid", date: "Today, 10:42" },
  { id: "INV-2093", patient: "PAT-6318", service: "MRI scan", amount: "180.00", status: "Confirming", date: "Today, 09:18" },
  { id: "INV-2092", patient: "PAT-4091", service: "Lab panel", amount: "75.00", status: "Paid", date: "Yesterday" },
  { id: "INV-2091", patient: "PAT-8812", service: "Ultrasound", amount: "100.00", status: "Partially paid", date: "Yesterday" },
  { id: "INV-2089", patient: "PAT-1182", service: "Consultation", amount: "55.00", status: "Expired", date: "14 Aug" },
];

type ApiInvoice = {
  id?: string;
  invoice_number: string;
  patient_reference: string;
  service_description: string;
  amount_minor: string | number;
  status: string;
  created_at: string;
  public_id?: string;
  payment_reference?: string;
  recipient_address?: string;
};

type ApiPayerPayment = {
  id: string;
  transaction_hash: string;
  amount_minor: string;
  token_symbol: string;
  status: string;
  confirmed_at: string;
  invoice_number: string;
  patient_reference: string;
  service_description: string;
  provider_name: string;
  provider_type?: string;
  provider_country?: string;
  provider_address?: string;
};
type ApiEscrow = { id: string; public_id?: string; payment_reference?: string; patient_reference: string; treatment_name: string; provider_wallet: string; payer_wallet?: string; payer_wallets?: Array<{ wallet_address: string; display_name?: string }>; approval_policy: string; required_payer_approvals?: number; total_minor: string; funded_minor?: string; released_minor: string; chain_escrow_id?: string; create_tx_hash?: string; fund_tx_hash?: string; status: string; milestones: Array<{ milestone_index: number; label: string; amount_minor: string; status: string; evidence_hash?: string; evidence_url?: string; evidence_description?: string; payer_approval_count?: number; approve_tx_hash?: string; release_tx_hash?: string }> };

function invoiceRowFromApi(invoice: ApiInvoice) {
  const minor = String(invoice.amount_minor).padStart(7, "0");
  const whole = minor.slice(0, -6).replace(/^0+(?=\d)/, "");
  const fraction = minor.slice(-6).replace(/0+$/, "");
  return {
    id: invoice.invoice_number,
    patient: invoice.patient_reference,
    service: invoice.service_description,
    amount: fraction ? `${whole}.${fraction}` : `${whole}.00`,
    status: invoice.status.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" "),
    date: new Date(invoice.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    publicId: invoice.public_id,
    paymentReference: invoice.payment_reference,
  };
}

const payments = [
  { id: "PAY-8432", invoice: "INV-2094", payer: "0x71C4...9A20", amount: "300.00", status: "Confirmed", time: "10:42" },
  { id: "PAY-8431", invoice: "INV-2093", payer: "0xA820...18F4", amount: "180.00", status: "Confirming", time: "09:18" },
  { id: "PAY-8429", invoice: "INV-2092", payer: "0x32B1...A910", amount: "75.00", status: "Confirmed", time: "Yesterday" },
  { id: "PAY-8427", invoice: "INV-2091", payer: "0x551D...20EE", amount: "80.00", status: "Needs review", time: "Yesterday" },
];

const milestones = [
  { label: "Funded", detail: "$1,200", state: "complete" },
  { label: "Session 1", detail: "$100 released", state: "complete" },
  { label: "Session 2", detail: "$100 released", state: "complete" },
  { label: "Session 3", detail: "$100 released", state: "complete" },
  { label: "Session 4", detail: "$100 released", state: "complete" },
  { label: "Session 5", detail: "$100 released", state: "complete" },
  { label: "Session 6", detail: "Awaiting provider", state: "current" },
  { label: "Session 7", detail: "Upcoming", state: "pending" },
];

export function USDCareApp() {
  const privyEnabled = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  return privyEnabled ? <PrivyExperience /> : <DemoExperience />;
}

function PrivyExperience() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { ready: walletsReady, wallets } = useWallets();
  const { connectWallet } = useConnectWallet();
  const [onboardingState, setOnboardingState] = useState<AccountState | null>(null);
  const [accountLoadError, setAccountLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const loadAccount = async () => {
      try {
        let token = await getAccessToken();
        for (let attempt = 0; !token && attempt < 3; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 400));
          token = await getAccessToken();
        }
        if (!token) throw new Error("Your Privy session is unavailable. Sign in again.");

        const response = await fetch(`${apiUrl}/v1/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as {
          onboarded?: boolean;
          accountType?: AccountType | null;
          organizations?: Array<{ id: string; name: string; organization_type: string; verification_status: string; role: string; country?: string; address?: string; website?: string; contact_email?: string; phone?: string; primary_wallet_address?: string }>;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(body?.error ?? "USDCare could not load your account.");

        if (!cancelled) {
          setAccountLoadError(null);
          setOnboardingState({
            userId: user.id,
            onboarded: Boolean(body?.onboarded),
            accountType: body?.accountType ?? null,
            organizations: (body?.organizations ?? []).map((organization) => ({
              id: organization.id,
              name: organization.name,
              type: organization.organization_type,
              verificationStatus: organization.verification_status,
              role: organization.role,
              country: organization.country,
              address: organization.address,
              website: organization.website,
              contactEmail: organization.contact_email,
              phone: organization.phone,
              primaryWalletAddress: organization.primary_wallet_address,
            })),
          });
        }
      } catch (error) {
        if (!cancelled) {
          setAccountLoadError(error instanceof Error ? error.message : "USDCare could not load your account.");
          setOnboardingState({ userId: user.id, onboarded: false, accountType: null, organizations: [] });
        }
      }
    };

    void loadAccount();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (!ready) {
    return <LoadingScreen label="Securing your workspace" />;
  }

  if (!authenticated || !user) {
    return <AuthScreen onLogin={login} />;
  }

  const onboarded = onboardingState?.userId === user.id ? onboardingState.onboarded : null;

  if (!walletsReady || onboarded === null) {
    return <LoadingScreen label="Loading your Privy wallet" />;
  }

  const walletSummaries: WalletSummary[] = wallets.map((wallet, index) => ({
    address: wallet.address,
    label: wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2"
      ? "Privy built-in wallet"
      : wallet.meta.name || `Connected wallet ${index + 1}`,
    type: wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2" ? "embedded" : "external",
    verified: wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2" || wallet.linked,
  }));

  if (!onboarded) {
    return (
      <Onboarding
        email={user.email?.address ?? "Verified email"}
        wallets={walletSummaries}
        onConnectWallet={() => connectWallet()}
        onLogout={logout}
        onVerifyWallet={async (address) => {
          const wallet = wallets.find((candidate) => candidate.address.toLowerCase() === address.toLowerCase());
          if (!wallet) throw new Error("Connect the wallet before verifying it.");
          await wallet.loginOrLink();
        }}
        initialError={accountLoadError}
        onComplete={async (input) => {
          const token = await getAccessToken();
          if (!token) throw new Error("Your Privy session expired. Sign in again.");

          const response = await fetch(`${apiUrl}/v1/onboarding`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(input),
          });
          const body = await response.json().catch(() => null) as { organizationId?: string | null; error?: string } | null;
          if (!response.ok) throw new Error(body?.error ?? "USDCare could not create your account.");

          setOnboardingState({
            userId: user.id,
            onboarded: true,
            accountType: input.accountType,
            organizations: input.accountType === "organization" && input.organization && body?.organizationId
              ? [{ id: body.organizationId, name: input.organization.name, type: input.organization.type, verificationStatus: "pending", role: "administrator", primaryWalletAddress: input.transactionWalletAddress }]
              : [],
          });
        }}
      />
    );
  }

  return (
    <ProviderWorkspace
      email={user.email?.address ?? "Account"}
      wallets={walletSummaries}
      organization={onboardingState?.organizations[0]}
      getAccessToken={getAccessToken}
      onConnectWallet={() => connectWallet()}
      onLogout={logout}
      onRestartOnboarding={() => {
        setOnboardingState({ userId: user.id, onboarded: false, accountType: onboardingState?.accountType ?? null, organizations: onboardingState?.organizations ?? [] });
      }}
    />
  );
}

function DemoExperience() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  if (showOnboarding) {
    return (
      <Onboarding
        email="finance@lakeside.example"
        wallets={demoWallets}
        onConnectWallet={() => undefined}
        onVerifyWallet={async () => undefined}
        onComplete={async () => setShowOnboarding(false)}
        demo
      />
    );
  }

  return (
    <ProviderWorkspace
      email="finance@lakeside.example"
      wallets={demoWallets}
      organization={{ id: "demo", name: "Lakeside Diagnostic Centre", type: "diagnostic_centre", verificationStatus: "verified", role: "administrator" }}
      onConnectWallet={() => undefined}
      onLogout={() => undefined}
      onRestartOnboarding={() => setShowOnboarding(true)}
      demo
    />
  );
}

function AuthScreen({ onLogin }: { onLogin: () => void }) {
  return (
    <main className="campaign-shell">
      <section className="campaign-hero">
        <div className="campaign-ripples" aria-hidden="true"><i /><i /><i /><i /></div>
        <header className="campaign-header">
          <Brand />
          <nav className="campaign-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a><a href="#care-plans">Care plans</a><a href="#providers">Providers</a><a href="#impact">About</a>
          </nav>
          <button className="campaign-signin" onClick={onLogin}>Sign in <ArrowUpRight size={15} /></button>
        </header>
        <div className="campaign-hero-inner">
          <div className="campaign-hero-copy">
            <p className="campaign-kicker"><span /> Healthcare payments, held with care</p>
            <h1>Healthcare payments<br /><em>that move with care.</em></h1>
            <p className="campaign-lede">A clear, protected way to fund treatment, support providers, and see every release as care is delivered.</p>
            <div className="campaign-actions"><button className="campaign-button campaign-button-light" onClick={onLogin}>Get started <ArrowUpRight size={16} /></button><a className="campaign-text-link" href="#how-it-works">Learn how it works <ArrowDownToLine size={15} /></a></div>
          </div>
          <div className="campaign-care-card" id="care-plans"><div className="campaign-card-top"><span className="campaign-status"><Check size={13} /> Funds secured</span><span className="campaign-card-label">CARE PLAN · 0012</span></div><div className="campaign-card-title"><div><p>Kidney dialysis</p><h2>12 sessions · 1,200 USDC</h2></div><HeartPulse size={27} /></div><div className="campaign-card-balance"><span>Still protected</span><strong>700.00 <small>USDC</small></strong></div><MiniCareRail /><div className="campaign-card-event"><span><Check size={14} /></span><div><strong>Session 5 released</strong><small>100 USDC to Lakeside Dialysis Centre</small></div><b>Verified</b></div></div>
        </div>
        <div className="campaign-scroll-note"><span /> Scroll to explore</div>
      </section>
      <section className="campaign-cream" id="how-it-works"><div className="campaign-section-label">A better care rail <span>01</span></div><div className="campaign-two-column"><h2>Money should follow<br /><em>the treatment.</em></h2><div><p>USDCare connects funders, patients, and providers through one accountable payment record. Funds are committed, protected, and released around real moments of care.</p><button className="campaign-button campaign-button-dark" onClick={onLogin}>Create your care rail <ArrowUpRight size={16} /></button></div></div><div className="campaign-steps"><div><span>01</span><strong>Fund</strong><p>Family, sponsor, or organization commits the care budget.</p></div><div><span>02</span><strong>Protect</strong><p>Funds stay visible and secured until the plan is ready.</p></div><div><span>03</span><strong>Release</strong><p>Providers receive payment as milestones are confirmed.</p></div></div></section>
      <section className="campaign-forest" id="providers"><div className="campaign-section-label">For the care team <span>02</span></div><div className="campaign-provider-grid"><div><p className="campaign-kicker"><span /> Built for providers</p><h2>Less chasing.<br /><em>More caring.</em></h2></div><p>Give every treatment a shareable payment request, a verified settlement trail, and a calmer way to reconcile who funded what.</p></div></section>
      <section className="campaign-impact" id="impact"><div className="campaign-section-label">The USDCare standard <span>03</span></div><div className="campaign-impact-grid"><h2>Clarity is<br /><em>care.</em></h2><p>Patients deserve to know where their funding is. Families deserve confidence across borders. Providers deserve settlement that arrives with context.</p><div className="campaign-impact-stat"><strong>100%</strong><span>of every release carries its treatment context.</span></div></div></section>
    </main>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <main className="loading-screen">
      <Brand />
      <div className="loading-line"><span /></div>
      <p>{label}</p>
    </main>
  );
}

function Onboarding({
  email,
  wallets,
  onConnectWallet,
  onVerifyWallet,
  onLogout,
  onComplete,
  initialError = null,
  demo = false,
}: {
  email: string;
  wallets: WalletSummary[];
  onConnectWallet: () => void;
  onVerifyWallet: (address: string) => Promise<void>;
  onLogout?: () => void;
  onComplete: (input: OnboardingInput) => Promise<void>;
  initialError?: string | null;
  demo?: boolean;
}) {
  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [transactionWallet, setTransactionWallet] = useState<WalletChoice>("embedded");
  const [organizationName, setOrganizationName] = useState("");
  const [organizationType, setOrganizationType] = useState<OrganizationType>("hospital");
  const [organizationCountry, setOrganizationCountry] = useState("");
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [organizationWebsite, setOrganizationWebsite] = useState("");
  const [organizationContactEmail, setOrganizationContactEmail] = useState("");
  const [organizationPhone, setOrganizationPhone] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(initialError);
  const [submitting, setSubmitting] = useState(false);
  const totalSteps = 3;

  const next = () => setStep((value) => Math.min(value + 1, totalSteps));
  const back = () => setStep((value) => Math.max(value - 1, 1));
  const embedded = wallets.find((wallet) => wallet.type === "embedded") ?? wallets[0];
  const external = wallets.find((wallet) => wallet.type === "external");
  const selectedTransactionWallet = transactionWallet === "embedded" ? embedded : external;

  const completeOnboarding = async () => {
    if (!accountType || !selectedTransactionWallet) return;
    if (accountType === "organization" && !organizationName.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      await onComplete({
        accountType,
        identityName: accountType === "organization" ? organizationName.trim() : email.split("@")[0],
        email,
        organization: accountType === "organization"
          ? { name: organizationName.trim(), type: organizationType, country: organizationCountry.trim(), address: organizationAddress.trim(), website: organizationWebsite.trim(), contactEmail: organizationContactEmail.trim(), phone: organizationPhone.trim() }
          : undefined,
        wallets: wallets.map((wallet) => ({
          address: wallet.address,
          walletType: wallet.type,
          chain: "eip155:5042002",
        })),
        transactionWalletAddress: selectedTransactionWallet.address,
        sharedWalletRiskAcknowledged: false,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "USDCare could not create your account.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Brand />
        <div className="onboarding-account-actions">
          <div className="verified-email"><BadgeCheck size={16} /><span>{email}</span></div>
        </div>
      </header>
      <div className="onboarding-layout">
        <aside className="onboarding-rail" aria-label="Account setup progress">
          <p>Account setup</p>
          {["Account", accountType === "organization" ? "Organization wallet" : "Wallet", "Review"].map((label, index) => (
            <div className={`setup-step ${step === index + 1 ? "active" : ""} ${step > index + 1 ? "done" : ""}`} key={label}>
              <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
              {label}
            </div>
          ))}
        </aside>
        <section className="onboarding-panel">
          {demo && <div className="demo-notice">Privy preview mode. Add your Privy environment keys to activate live email and wallet flows.</div>}
          {step === 1 && (
            <div className="setup-content">
              <div className="setup-kicker">Email verified</div>
              <h1>Who is this account for?</h1>
              <p>This choice sets up your first workspace. You can join other organizations later.</p>
              <div className="choice-grid">
                <button className={`choice-card ${accountType === "individual" ? "selected" : ""}`} onClick={() => setAccountType("individual")}>
                  <Users size={22} />
                  <strong>An individual</strong>
                  <span>A patient, family member, sponsor, or donor paying personally.</span>
                  <i>{accountType === "individual" && <Check size={14} />}</i>
                </button>
                <button className={`choice-card ${accountType === "organization" ? "selected" : ""}`} onClick={() => setAccountType("organization")}>
                  <Building2 size={22} />
                  <strong>An organization</strong>
                  <span>A healthcare provider, NGO, employer, insurer, or funder.</span>
                  <i>{accountType === "organization" && <Check size={14} />}</i>
                </button>
              </div>
              {accountType === "organization" && (
                <div className="organization-fields">
                  <label>
                    <span>Organization name</span>
                    <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} placeholder="Lakeside Diagnostic Centre" />
                  </label>
                  <label>
                    <span>Organization type</span>
                    <select value={organizationType} onChange={(event) => setOrganizationType(event.target.value as OrganizationType)}>
                      <option value="hospital">Hospital</option>
                      <option value="clinic">Clinic</option>
                      <option value="diagnostic_centre">Diagnostic centre</option>
                      <option value="pharmacy">Pharmacy</option>
                      <option value="ngo">NGO or charity</option>
                      <option value="employer">Employer</option>
                      <option value="insurer">Insurer</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label><span>Country</span><input value={organizationCountry} onChange={(event) => setOrganizationCountry(event.target.value)} placeholder="Nigeria" /></label>
                  <label className="full-field"><span>Address</span><input value={organizationAddress} onChange={(event) => setOrganizationAddress(event.target.value)} placeholder="12 Health Avenue, Lagos" /></label>
                  <label><span>Contact email</span><input type="email" value={organizationContactEmail} onChange={(event) => setOrganizationContactEmail(event.target.value)} placeholder="billing@clinic.example" /></label>
                  <label><span>Phone</span><input value={organizationPhone} onChange={(event) => setOrganizationPhone(event.target.value)} placeholder="+234 ..." /></label>
                </div>
              )}
              <SetupActions onBack={back} onNext={next} disableBack disableNext={!accountType || (accountType === "organization" && !organizationName.trim())} />
            </div>
          )}
          {step === 2 && (
            <div className="setup-content">
              <div className="setup-kicker">Privy wallet ready</div>
              <h1>Choose how you transact</h1>
              <p>Your transaction wallet approves payments and financial actions. Privy created a built-in wallet for this account.</p>
              <WalletOption wallet={embedded} title="Use built-in wallet" description="Created and recovered through your Privy account." selected={transactionWallet === "embedded"} onClick={() => setTransactionWallet("embedded")} />
              <WalletOption wallet={external} title="Connect existing wallet" description="Use an outside wallet through Privy's secure connector." selected={transactionWallet === "external"} onClick={() => {
                if (!external) return onConnectWallet();
                if (!external.verified) return void onVerifyWallet(external.address);
                setTransactionWallet("external");
              }} action={!external ? "Connect" : !external.verified ? "Verify" : undefined} />
              <div className="security-line"><ShieldCheck size={16} /> USDCare never asks for your recovery phrase or private key.</div>
              <SetupActions onBack={back} onNext={next} disableNext={!selectedTransactionWallet || !selectedTransactionWallet.verified} />
            </div>
          )}
          {step === totalSteps && (
            <div className="setup-content">
              <div className="setup-kicker">Ready to create</div>
              <h1>Review your account</h1>
              <p>These wallet roles remain visible in settings and require verification to change.</p>
              <div className="review-list">
                <ReviewRow label="Account" value={accountType === "organization" ? organizationName : email} />
                <ReviewRow label="Signed in as" value={email} />
                <ReviewRow label="Transaction wallet" value={`${transactionWallet === "embedded" ? "Built-in wallet" : "Connected wallet"} · ${shortAddress(transactionWallet === "embedded" ? embedded?.address : external?.address)}`} mono />
                {accountType === "organization" && <ReviewRow label="Organization wallet" value={`${shortAddress(selectedTransactionWallet?.address)}`} mono />}
                <ReviewRow label="Network" value="Arc Testnet" />
              </div>
              <div className="security-line"><ShieldCheck size={16} /> Wallet signing and recovery are provided by Privy.</div>
              {submitError && <div className="form-error" role="alert"><AlertCircle size={17} /> {submitError}</div>}
              <div className="setup-actions">
                <button className="button button-secondary" onClick={back}>Back</button>
                <button className="button button-primary" onClick={completeOnboarding} disabled={submitting}>
                  {submitting ? "Creating account..." : `Create ${accountType} account`}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SetupActions({ onBack, onNext, disableBack = false, disableNext = false }: { onBack: () => void; onNext: () => void; disableBack?: boolean; disableNext?: boolean }) {
  return (
    <div className="setup-actions">
      <button className="button button-secondary" onClick={onBack} disabled={disableBack}>Back</button>
      <button className="button button-primary" onClick={onNext} disabled={disableNext}>Continue</button>
    </div>
  );
}

function WalletOption({ wallet, title, description, selected, onClick, action }: { wallet?: WalletSummary; title: string; description: string; selected: boolean; onClick: () => void; action?: string }) {
  return (
    <button className={`wallet-option ${selected ? "selected" : ""}`} onClick={onClick}>
      <span className="wallet-icon"><WalletCards size={20} /></span>
      <span className="wallet-copy"><strong>{title}</strong><small>{wallet ? `${shortAddress(wallet.address)} · Arc Testnet` : description}</small></span>
      {action ? <span className="wallet-action">{action}</span> : <span className="radio-mark">{selected && <Check size={13} />}</span>}
    </button>
  );
}

function ReviewRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="review-row"><span>{label}</span><strong className={mono ? "mono" : ""}>{value}</strong></div>;
}

function ProviderWorkspace({
  email,
  wallets,
  organization,
  getAccessToken,
  onConnectWallet,
  onLogout,
  onRestartOnboarding,
  demo = false,
}: {
  email: string;
  wallets: WalletSummary[];
  organization?: OrganizationSummary;
  getAccessToken?: () => Promise<string | null>;
  onConnectWallet: () => void;
  onLogout: () => void;
  onRestartOnboarding: () => void;
  demo?: boolean;
}) {
  const [activeView, setActiveView] = useState<NavView>("overview");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [accountMenu, setAccountMenu] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [invoiceRows, setInvoiceRows] = useState(demo ? initialInvoices : []);
  const [payerPayments, setPayerPayments] = useState<ApiPayerPayment[]>([]);
  const [escrowModal, setEscrowModal] = useState(false);
  const [escrows, setEscrows] = useState<ApiEscrow[]>([]);
  const [invoiceLoadError, setInvoiceLoadError] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenu) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenu(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [accountMenu]);

  useEffect(() => {
    if (demo || !organization || !getAccessToken) return;

    let cancelled = false;
    const loadInvoices = async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("Your Privy session expired. Sign in again.");
        const response = await fetch(`${apiUrl}/v1/organizations/${organization.id}/invoices`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const body = await response.json().catch(() => null) as { invoices?: ApiInvoice[]; error?: string } | null;
        if (!response.ok) throw new Error(body?.error ?? "Invoices could not be loaded.");
        if (!cancelled) {
          setInvoiceRows((body?.invoices ?? []).map(invoiceRowFromApi));
          setInvoiceLoadError(null);
        }
      } catch (error) {
        if (!cancelled) setInvoiceLoadError(error instanceof Error ? error.message : "Invoices could not be loaded.");
      }
    };

    void loadInvoices();
    return () => { cancelled = true; };
  }, [demo, getAccessToken, organization]);

  useEffect(() => {
    if (demo || !getAccessToken) return;
    let cancelled = false;
    const loadPayerPayments = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const response = await fetch(`${apiUrl}/v1/me/payments`, { headers: { Authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => null) as { payments?: ApiPayerPayment[] } | null;
        if (response.ok && !cancelled) setPayerPayments(body?.payments ?? []);
      } catch { /* The rest of the workspace remains usable while history is unavailable. */ }
    };
    void loadPayerPayments();
    return () => { cancelled = true; };
  }, [demo, getAccessToken]);

  const loadEscrows = async () => {
    if (demo || !getAccessToken) return;
    const token = await getAccessToken();
    if (!token) return;
    const url = organization ? `${apiUrl}/v1/organizations/${organization.id}/escrows` : `${apiUrl}/v1/me/escrows`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => null) as { escrows?: ApiEscrow[] } | null;
    if (response.ok) setEscrows(body?.escrows ?? []);
  };
  useEffect(() => { void loadEscrows(); }, [demo, getAccessToken, organization]);

  const [notifications, setNotifications] = useState<Array<{ id: string; title: string; message: string; link_url: string; is_read: boolean; created_at: string }>>([]);

  const loadNotifications = async () => {
    if (demo || !getAccessToken) return;
    const token = await getAccessToken();
    if (!token) return;
    const orgQuery = organization ? `?organizationId=${organization.id}` : "";
    const response = await fetch(`${apiUrl}/v1/notifications${orgQuery}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.notifications) setNotifications(body.notifications);
  };
  useEffect(() => { void loadNotifications(); const id = window.setInterval(loadNotifications, 30_000); return () => window.clearInterval(id); }, [demo, getAccessToken, organization]);

  const toggleNotifications = async () => {
    setNotificationsOpen((open) => {
      const opening = !open;
      if (opening && notifications.some((n) => !n.is_read) && getAccessToken) {
        void (async () => {
          const token = await getAccessToken();
          if (token) {
            await fetch(`${apiUrl}/v1/notifications/read`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ organizationId: organization?.id }) });
            setNotifications((list) => list.map((n) => ({ ...n, is_read: true })));
          }
        })();
      }
      return opening;
    });
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const titles: Record<NavView, string> = {
    overview: "Overview",
    payments: "Payments",
    invoices: "Invoices",
    escrows: "Care funding plans",
    patients: "Patients",
    reports: "Reports",
    settings: "Settings",
    help: "Help centre",
  };

  const handleCreateInvoice = async (invoice: { patient: string; service: string; amount: string }) => {
    if (demo) {
      setInvoiceRows((rows) => [{ id: `INV-${2095 + rows.length}`, patient: invoice.patient, service: invoice.service, amount: invoice.amount, status: "Awaiting payment", date: "Just now" }, ...rows]);
    } else {
      if (!organization || !getAccessToken) throw new Error("An organization workspace is required to create provider invoices.");
      const token = await getAccessToken();
      if (!token) throw new Error("Your Privy session expired. Sign in again.");
      const response = await fetch(`${apiUrl}/v1/organizations/${organization.id}/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          patientReference: invoice.patient,
          serviceDescription: invoice.service,
          amountUsdc: invoice.amount,
        }),
      });
      const body = await response.json().catch(() => null) as { invoice?: ApiInvoice; error?: string } | null;
      if (!response.ok || !body?.invoice) throw new Error(body?.error ?? "Payment request could not be created.");
      const created = body.invoice as ApiInvoice & { paymentRequest?: { public_id?: string; payment_reference?: string } };
      setInvoiceRows((rows) => [invoiceRowFromApi({ ...created, public_id: created.public_id ?? created.paymentRequest?.public_id, payment_reference: created.payment_reference ?? created.paymentRequest?.payment_reference }), ...rows]);
    }
    setInvoiceModal(false);
    setActiveView("invoices");
  };

  const organizationName = organization?.name ?? "Personal account";
  return (
    <div className="app-shell medical-workspace">
      <Sidebar activeView={activeView} onNavigate={(view) => { setActiveView(view); setMobileMenu(false); }} open={mobileMenu} />
      {mobileMenu && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" aria-label="Open menu" onClick={() => setMobileMenu(true)}><Menu size={19} /></button>
          </div>
          <div className="topbar-actions">
            {demo && <span className="demo-chip">Privy preview</span>}
            <button className="icon-button" aria-label="Search invoices" title="Search invoices" onClick={() => setActiveView("invoices")}><Search size={18} /></button>
            <div className="header-menu-wrap"><button className={`icon-button notification-button ${unreadCount > 0 ? "has-unread" : ""}`} aria-label="Notifications" onClick={() => void toggleNotifications()}><Bell size={18} />{unreadCount > 0 && <i />}</button>{notificationsOpen && <div className="header-popover"><strong>Notifications</strong>{notifications.length === 0 ? <p>No new payment or escrow notifications.</p> : <div className="notification-list">{notifications.map((n) => <div key={n.id} className={`notification-item ${n.is_read ? "read" : ""}`}><strong>{n.title}</strong><p>{n.message}</p>{n.link_url && <a href={n.link_url} target="_blank" rel="noreferrer">View details</a>}</div>)}</div>}</div>}</div>
            <div className="header-menu-wrap" ref={accountMenuRef}><button className="account-button" title={email} aria-expanded={accountMenu} onClick={() => setAccountMenu((open) => !open)}><span>{email.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></button>{accountMenu && <div className="header-popover account-popover"><strong>{email}</strong><button onClick={() => { setAccountMenu(false); setActiveView("settings"); }}><Settings size={15} /> Settings</button><button onClick={onLogout}><LogOut size={15} /> Log out</button></div>}</div>
          </div>
        </header>
        <div className="page-content">
          {demo && (
            <div className="config-banner">
              <span><ShieldCheck size={17} /> Demo data is active. Add `NEXT_PUBLIC_PRIVY_APP_ID` to enable live Privy email and wallet flows.</span>
              <button onClick={onRestartOnboarding}>Preview onboarding</button>
            </div>
          )}
          {invoiceLoadError && <div className="form-error page-error" role="alert"><AlertCircle size={17} /> {invoiceLoadError}</div>}
          <div className="page-heading">
            <div><p>Sunday, 16 August</p><h1>{titles[activeView]}</h1></div>
            {organization && (activeView === "overview" || activeView === "invoices") && <button className="button button-primary" onClick={() => setInvoiceModal(true)}><Plus size={17} /> New care payment</button>}
          </div>
          {activeView === "overview" && (demo ? <Overview onViewInvoices={() => setActiveView("invoices")} onViewPayments={() => setActiveView("payments")} onViewEscrow={() => setActiveView("escrows")} /> : organization ? <LiveOrganizationOverview invoices={invoiceRows} onViewInvoices={() => setActiveView("invoices")} /> : <IndividualOverview payerPayments={payerPayments} escrows={escrows} onViewPayments={() => setActiveView("payments")} onViewEscrows={() => setActiveView("escrows")} />)}
          {activeView === "payments" && <PaymentsView live={!demo} payerPayments={payerPayments} />}
          {activeView === "invoices" && <InvoicesView invoices={invoiceRows} onCreate={() => setInvoiceModal(true)} />}
          {activeView === "escrows" && <EscrowsView live={!demo} escrows={escrows} isProvider={!!organization} onCreate={() => setEscrowModal(true)} getAccessToken={getAccessToken} organizationWallet={organization?.primaryWalletAddress ?? wallets[0]?.address} onUpdated={loadEscrows} />}
          {activeView === "patients" && <PatientsView live={!demo} />}
          {activeView === "reports" && <ReportsView live={!demo} />}
          {activeView === "help" && <HelpView />}
          {activeView === "settings" && <SettingsView email={email} wallets={wallets} organization={organization} onConnectWallet={onConnectWallet} demo={demo} />}
        </div>
      </main>
      <MobileNav activeView={activeView} onNavigate={setActiveView} isProvider={!!organization} />
      {invoiceModal && <CreateInvoiceModal organizationName={organizationName} onClose={() => setInvoiceModal(false)} onCreate={handleCreateInvoice} />}
      {escrowModal && organization && getAccessToken && <CreateEscrowModal organizationId={organization.id} organizationWallet={organization.primaryWalletAddress ?? wallets[0]?.address ?? ""} getAccessToken={getAccessToken} onClose={() => setEscrowModal(false)} onCreated={(paymentUrl) => { setEscrowModal(false); void loadEscrows(); if (paymentUrl) window.location.href = paymentUrl; }} />}
    </div>
  );
}

function Sidebar({ activeView, onNavigate, open, isProvider = true }: { activeView: NavView; onNavigate: (view: NavView) => void; open: boolean; isProvider?: boolean }) {
  const allItems: { view: NavView; label: string; icon: typeof LayoutDashboard; providerOnly?: boolean }[] = [
    { view: "overview", label: "Overview", icon: LayoutDashboard },
    { view: "payments", label: "Payments", icon: CircleDollarSign },
    { view: "invoices", label: "Invoices", icon: FileText, providerOnly: true },
    { view: "escrows", label: "Care plans", icon: HeartPulse },
    { view: "patients", label: "Patients", icon: Users, providerOnly: true },
    { view: "reports", label: "Reports", icon: ClipboardList, providerOnly: true },
  ];
  const items = allItems.filter(item => isProvider || !item.providerOnly);
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <Brand />
      <nav>
        {items.map(({ view, label, icon: Icon }) => <button key={view} className={activeView === view ? "active" : ""} onClick={() => onNavigate(view)}><Icon size={18} /> {label}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <button className={activeView === "help" ? "active" : ""} onClick={() => onNavigate("help")}><HelpCircle size={18} /> Help centre</button>
      </div>
    </aside>
  );
}

function MobileNav({ activeView, onNavigate, isProvider = true }: { activeView: NavView; onNavigate: (view: NavView) => void; isProvider?: boolean }) {
  return (
    <nav className="mobile-nav">
      <button className={activeView === "overview" ? "active" : ""} onClick={() => onNavigate("overview")}><LayoutDashboard size={19} /><span>Overview</span></button>
      <button className={activeView === "payments" ? "active" : ""} onClick={() => onNavigate("payments")}><CircleDollarSign size={19} /><span>Payments</span></button>
      {isProvider && <button className={activeView === "invoices" ? "active" : ""} onClick={() => onNavigate("invoices")}><FileText size={19} /><span>Invoices</span></button>}
      <button className={activeView === "escrows" ? "active" : ""} onClick={() => onNavigate("escrows")}><HeartPulse size={19} /><span>Care plans</span></button>
    </nav>
  );
}

function IndividualOverview({
  payerPayments = [],
  escrows = [],
  onViewPayments,
  onViewEscrows,
}: {
  payerPayments?: ApiPayerPayment[];
  escrows?: ApiEscrow[];
  onViewPayments: () => void;
  onViewEscrows: () => void;
}) {
  const totalPaidFormatted = useMemo(() => {
    const sumPayments = payerPayments.reduce((acc, p) => acc + (Number(p.amount_minor) || 0), 0);
    const sumEscrows = escrows.reduce((acc, e) => acc + (Number(e.funded_minor || e.total_minor) || 0), 0);
    return ((sumPayments + sumEscrows) / 1_000_000).toFixed(2);
  }, [payerPayments, escrows]);

  const hasActivity = payerPayments.length > 0 || escrows.length > 0;

  if (!hasActivity) {
    return (
      <div className="content-stack">
        <section className="panel empty-workspace-panel">
          <div className="empty-workspace-icon"><WalletCards size={24} /></div>
          <div>
            <h2>Your healthcare payment account is ready</h2>
            <p>Use your Arc Testnet wallet to pay a provider payment link or fund a care plan. Your payment history and verified receipts will appear here.</p>
          </div>
        </section>
        <section className="panel empty-state-panel">
          <div><h2>No payment activity yet</h2><p>There are no confirmed invoices or active care plans connected to this account.</p></div>
        </section>
      </div>
    );
  }

  return (
    <div className="content-stack">
      <section className="summary-band">
        <SummaryItem label="Total Funded & Paid" value={totalPaidFormatted} suffix="USDC" detail={`${payerPayments.length + escrows.length} total activity items`} success />
        <SummaryItem label="Direct Payments" value={String(payerPayments.length)} detail="Confirmed provider invoices" />
        <SummaryItem label="Care Plans" value={String(escrows.length)} detail="Active & completed treatment escrows" />
      </section>

      {payerPayments.length > 0 && (
        <section className="panel data-panel">
          <div className="section-title payment-history-title">
            <div>
              <h2>Recent Payments</h2>
              <p>Verified healthcare payments and receipts.</p>
            </div>
            <button type="button" className="button button-secondary" onClick={onViewPayments}>View all payments</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Provider</th><th>Invoice</th><th>Service</th><th className="amount-cell">Amount</th><th>Status</th><th>Date</th></tr>
              </thead>
              <tbody>
                {payerPayments.slice(0, 5).map((payment) => (
                  <tr key={payment.id}>
                    <td>
                      <strong>{payment.provider_name}</strong>
                      <small className="provider-meta">{[payment.provider_address, payment.provider_country].filter(Boolean).join(", ") || payment.provider_type?.replaceAll("_", " ")}</small>
                    </td>
                    <td className="strong-cell">{payment.invoice_number}<small className="provider-meta mono">{payment.patient_reference}</small></td>
                    <td>{payment.service_description}</td>
                    <td className="amount-cell mono">{(Number(payment.amount_minor) / 1_000_000).toFixed(2)} <small>{payment.token_symbol}</small></td>
                    <td>
                      <a className="transaction-status" href={`https://testnet.arcscan.app/tx/${payment.transaction_hash}`} target="_blank" rel="noreferrer">
                        <StatusBadge value={payment.status} /><ExternalLink size={13} />
                      </a>
                    </td>
                    <td className="muted-cell">{new Date(payment.confirmed_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {escrows.length > 0 && (
        <section className="panel data-panel">
          <div className="section-title payment-history-title">
            <div>
              <h2>Care Plans & Escrows</h2>
              <p>Milestone-based treatment funds and approvals.</p>
            </div>
            <button type="button" className="button button-secondary" onClick={onViewEscrows}>View all care plans</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Treatment & Patient</th><th>Status</th><th>Milestones</th><th className="amount-cell">Total Escrow</th></tr>
              </thead>
              <tbody>
                {escrows.slice(0, 5).map((escrow) => (
                  <tr key={escrow.id} className="interactive-row" onClick={() => escrow.public_id && window.open(`/escrow-pay/${escrow.public_id}`, "_blank")}>
                    <td>
                      <strong>{escrow.treatment_name}</strong>
                      <small className="provider-meta">Ref: {escrow.patient_reference}</small>
                    </td>
                    <td><StatusBadge value={escrow.status} /></td>
                    <td>{escrow.milestones.length} milestones ({escrow.milestones.filter(m => m.status === "RELEASED").length} released)</td>
                    <td className="amount-cell mono">{(Number(escrow.total_minor) / 1_000_000).toFixed(2)} <small>USDC</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Overview({ onViewInvoices, onViewPayments, onViewEscrow }: { onViewInvoices: () => void; onViewPayments: () => void; onViewEscrow: () => void }) {
  return (
    <div className="content-stack">
      <section className="summary-band">
        <SummaryItem label="Today" value="2,450.00" suffix="USDC" detail="8 confirmed payments" />
        <SummaryItem label="Pending" value="3" detail="1 needs attention" attention />
        <SummaryItem label="In escrow" value="8,200.00" suffix="USDC" detail="Across 6 treatments" />
        <SummaryItem label="Reconciliation" value="All matched" detail="Last checked 2 min ago" success />
      </section>
      <section className="attention-panel">
        <div className="section-title"><div><h2>Payments requiring attention</h2><p>Resolve exceptions before they delay care.</p></div><button className="text-button" onClick={onViewInvoices}>View all <ArrowUpRight size={15} /></button></div>
        <div className="attention-row"><span className="attention-icon"><AlertCircle size={18} /></span><div><strong>Invoice INV-2091 is partially paid</strong><p>80 of 100 USDC received for PAT-8812.</p></div><span className="status warning">Partially paid</span><button className="icon-button"><MoreHorizontal size={18} /></button></div>
      </section>
      <div className="overview-grid">
        <section className="panel recent-panel">
          <div className="section-title"><div><h2>Recent payments</h2><p>Latest provider payments.</p></div><button className="text-button" onClick={onViewPayments}>View payments <ArrowUpRight size={15} /></button></div>
          <PaymentTable compact />
        </section>
        <section className="panel care-panel">
          <div className="section-title"><div><h2>Active treatment</h2><p>Kidney dialysis · PAT-2048</p></div><span className="status success">Active</span></div>
          <div className="care-values"><div><span>Released</span><strong>500 USDC</strong></div><div><span>Still locked</span><strong>700 USDC</strong></div></div>
          <MiniCareRail />
          <button className="button button-secondary full-width" onClick={onViewEscrow}>Open treatment <ArrowUpRight size={16} /></button>
        </section>
      </div>
    </div>
  );
}

function LiveOrganizationOverview({ invoices, onViewInvoices }: { invoices: typeof initialInvoices; onViewInvoices: () => void }) {
  const awaiting = invoices.filter((invoice) => invoice.status.toLowerCase().includes("awaiting")).length;
  const paid = invoices.filter((invoice) => invoice.status.toLowerCase().includes("paid")).length;
  return <div className="content-stack"><section className="summary-band"><SummaryItem label="Invoices" value={String(invoices.length)} detail="Created payment requests" /><SummaryItem label="Awaiting payment" value={String(awaiting)} detail="Open invoices" attention={awaiting > 0} /><SummaryItem label="Paid" value={String(paid)} detail="Verified settlements" success={paid > 0} /><SummaryItem label="Network" value="Arc Testnet" detail="USDC settlement" /></section><section className="panel empty-state-panel"><div className="section-title"><div><h2>{invoices.length ? "Latest invoices" : "Create your first payment request"}</h2><p>{invoices.length ? "Open the invoice register to manage live requests." : "Invoices generate a provider payment destination and a shareable payment reference."}</p></div><button className="button button-secondary" onClick={onViewInvoices}>Open invoices <ArrowUpRight size={16} /></button></div></section></div>;
}

function SummaryItem({ label, value, suffix, detail, success, attention }: { label: string; value: string; suffix?: string; detail: string; success?: boolean; attention?: boolean }) {
  return <div className="summary-item"><span>{label}</span><strong className={suffix ? "mono" : ""}>{value} {suffix && <small>{suffix}</small>}</strong><p className={success ? "positive" : attention ? "amber" : ""}>{success && <Check size={13} />}{detail}</p></div>;
}

function PaymentsView({ live, payerPayments = [] }: { live: boolean; payerPayments?: ApiPayerPayment[] }) {
  if (live && !payerPayments.length) return <LiveEmpty title="No verified payments yet" description="Invoices you pay from a signed-in USDCare account will appear here with the provider and onchain receipt." />;
  if (live) return <section className="panel data-panel"><div className="section-title payment-history-title"><div><h2>Payments made</h2><p>Your verified healthcare invoices and provider records.</p></div></div><div className="table-wrap"><table><thead><tr><th>Provider</th><th>Invoice</th><th>Service</th><th className="amount-cell">Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{payerPayments.map((payment) => <tr key={payment.id}><td><strong>{payment.provider_name}</strong><small className="provider-meta">{[payment.provider_address, payment.provider_country].filter(Boolean).join(", ") || payment.provider_type?.replaceAll("_", " ")}</small></td><td className="strong-cell">{payment.invoice_number}<small className="provider-meta mono">{payment.patient_reference}</small></td><td>{payment.service_description}</td><td className="amount-cell mono">{(Number(payment.amount_minor) / 1_000_000).toFixed(2)} <small>{payment.token_symbol}</small></td><td><a className="transaction-status" href={`https://testnet.arcscan.app/tx/${payment.transaction_hash}`} target="_blank" rel="noreferrer"><StatusBadge value={payment.status} /><ExternalLink size={13} /></a></td><td className="muted-cell">{new Date(payment.confirmed_at).toLocaleDateString()}</td></tr>)}</tbody></table></div></section>;
  return <section className="panel data-panel"><TableToolbar placeholder="Search payments" /><PaymentTable /></section>;
}

function PaymentTable({ compact = false }: { compact?: boolean }) {
  const rows = compact ? payments.slice(0, 3) : payments;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Payment</th><th>Invoice</th><th>Payer</th><th className="amount-cell">Amount</th><th>Status</th><th>Time</th></tr></thead>
        <tbody>{rows.map((payment) => <tr key={payment.id}><td className="strong-cell">{payment.id}</td><td>{payment.invoice}</td><td className="mono muted-cell">{payment.payer}</td><td className="amount-cell mono">{payment.amount} <small>USDC</small></td><td><StatusBadge value={payment.status} /></td><td className="muted-cell">{payment.time}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function InvoicesView({ invoices, onCreate }: { invoices: Array<typeof initialInvoices[number] & { publicId?: string; paymentReference?: string }>; onCreate: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "complete">("all");
  const filtered = invoices.filter((invoice) => {
    const matchesQuery = `${invoice.id} ${invoice.patient} ${invoice.service}`.toLowerCase().includes(query.toLowerCase());
    const normalized = invoice.status.toLowerCase();
    const matchesFilter = filter === "all" || (filter === "pending" ? !normalized.includes("paid") && !normalized.includes("complete") : normalized.includes("paid") || normalized.includes("complete"));
    return matchesQuery && matchesFilter;
  });
  return (
    <section className="panel data-panel">
      <TableToolbar placeholder="Search invoices" query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter} action={<button className="button button-secondary" onClick={onCreate}><Plus size={16} /> New</button>} />
      <div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Patient</th><th>Service</th><th className="amount-cell">Amount</th><th>Status</th><th>Date</th></tr></thead><tbody>{filtered.length ? filtered.map((invoice) => <tr key={invoice.id} className={invoice.publicId ? "clickable-row" : undefined} onClick={() => invoice.publicId && (window.location.href = `/pay/${invoice.publicId}`)}><td className="strong-cell">{invoice.publicId ? <a href={`/pay/${invoice.publicId}`} onClick={(event) => event.stopPropagation()}>{invoice.id}</a> : invoice.id}</td><td>{invoice.patient}</td><td>{invoice.service}</td><td className="amount-cell mono">{invoice.amount} <small>USDC</small></td><td><StatusBadge value={invoice.status} /></td><td className="muted-cell">{invoice.date}</td></tr>) : <tr><td className="empty-table" colSpan={6}>{invoices.length ? "No invoices match this search or filter." : "No invoices yet. Create a payment request when a patient is ready to pay."}</td></tr>}</tbody></table></div>
    </section>
  );
}

function EscrowsView({ live, escrows, isProvider, onCreate, getAccessToken, organizationWallet, onUpdated }: { live: boolean; escrows: ApiEscrow[]; isProvider: boolean; onCreate: () => void; getAccessToken?: () => Promise<string | null>; organizationWallet?: string; onUpdated: () => Promise<void> }) {
  const [selectedEscrowId, setSelectedEscrowId] = useState<string | null>(null);
  const selectedEscrow = selectedEscrowId ? escrows.find((item) => item.id === selectedEscrowId) ?? null : null;
  
  if (live && !escrows.length) {
    return (
      <section className="panel empty-state-panel live-empty">
        <div className="empty-workspace-icon"><HeartPulse size={23} /></div>
        <div>
          <h2>No care funding plans yet</h2>
          {isProvider ? (
            <>
              <p>Create a milestone-based care plan, share its funding link, and release funds as treatment is delivered.</p>
              <button className="button button-primary" onClick={onCreate}><Plus size={16} /> New care plan</button>
            </>
          ) : (
            <p>Care plans that you fund or are connected to will appear here.</p>
          )}
        </div>
      </section>
    );
  }

  if (live) return (
    <>
      <section className="panel data-panel">
        <div className="section-title payment-history-title">
          <div>
            <h2>Care funding plans</h2>
            <p>{isProvider ? "Protected treatment funds that release as care milestones are confirmed." : "Care plans you are funding or participating in."}</p>
          </div>
          {isProvider && <button className="button button-primary" onClick={onCreate}><Plus size={16} /> New care plan</button>}
        </div>
        <div className="escrow-list">
          {escrows.map((escrow) => (
            <button 
              type="button" 
              className="escrow-list-row" 
              key={escrow.id} 
              onClick={() => {
                if (isProvider) {
                  setSelectedEscrowId(escrow.id);
                } else if (escrow.public_id) {
                  window.location.href = `/escrow-pay/${escrow.public_id}`;
                }
              }} 
              aria-label={`Open ${escrow.treatment_name} care plan`}
            >
              <div className="escrow-plan-main"><strong>{escrow.treatment_name}</strong><small>{escrow.patient_reference}</small></div>
              <div className="escrow-plan-amount"><span>Released</span><strong className="mono">{(Number(escrow.released_minor) / 1_000_000).toFixed(2)} / {(Number(escrow.total_minor) / 1_000_000).toFixed(2)} USDC</strong></div>
              <span className={`status ${escrow.status === "COMPLETED" ? "success" : escrow.status === "FUNDED" ? "info" : "warning"}`}>{escrow.status}</span>
              <ArrowUpRight className="escrow-row-arrow" size={17} />
            </button>
          ))}
        </div>
      </section>
      {isProvider && selectedEscrow && <EscrowDetailsDrawer escrow={selectedEscrow} organizationWallet={organizationWallet} getAccessToken={getAccessToken} onUpdated={onUpdated} onClose={() => setSelectedEscrowId(null)} />}
    </>
  );
  return (
    <div className="content-stack">
      <section className="escrow-header-panel">
        <div className="escrow-title"><div className="treatment-icon"><HeartPulse size={22} /></div><div><span className="status success">Active</span><h2>Kidney dialysis program</h2><p>PAT-2048 · Lakeside Dialysis Centre · ESC-1092</p></div></div>
        <button className="button button-secondary"><ReceiptText size={16} /> Financial history</button>
      </section>
      <section className="summary-band escrow-summary"><SummaryItem label="Funded" value="1,200.00" suffix="USDC" detail="12 treatment sessions" /><SummaryItem label="Released" value="500.00" suffix="USDC" detail="5 milestones complete" /><SummaryItem label="Still locked" value="700.00" suffix="USDC" detail="Held in escrow" /><SummaryItem label="Next action" value="Session 6" detail="Awaiting provider" attention /></section>
    <section className="panel care-rail-panel"><div className="section-title"><div><h2>Care Rail</h2><p>Treatment delivery and financial release in one record.</p></div><span className="mono small-text">Arc Testnet · 0x8A3...92F</span></div><CareRail /></section>
      <div className="two-column-grid"><section className="panel detail-panel"><div className="section-title"><div><h2>Current milestone</h2><p>Session 6 of 12</p></div><span className="status warning">Awaiting provider</span></div><dl><div><dt>Release amount</dt><dd className="mono">100.00 USDC</dd></div><div><dt>Approval policy</dt><dd>Provider + patient</dd></div><div><dt>Due</dt><dd>18 August 2026</dd></div></dl><button className="button button-primary full-width">Submit milestone evidence</button></section><section className="panel activity-panel"><div className="section-title"><div><h2>Financial activity</h2><p>Verified onchain events.</p></div></div>{["Session 5 released", "Session 5 approved", "Session 5 submitted"].map((item, index) => <div className="activity-row" key={item}><span className={index === 0 ? "green-dot" : "plain-dot"} /><div><strong>{item}</strong><p>{index === 0 ? "100 USDC · 14 Aug, 11:06" : `14 Aug, ${index === 1 ? "10:58" : "09:41"}`}</p></div>{index === 0 && <ArrowUpRight size={15} />}</div>)}</section></div>
    </div>
  );
}

function EscrowDetailsDrawer({ escrow, organizationWallet, getAccessToken, onUpdated, onClose }: { escrow: ApiEscrow; organizationWallet?: string; getAccessToken?: () => Promise<string | null>; onUpdated: () => Promise<void>; onClose: () => void }) {
  const { wallets } = useWallets();
  const released = Number(escrow.released_minor) / 1_000_000;
  const total = Number(escrow.total_minor) / 1_000_000;
  const paymentUrl = escrow.public_id && typeof window !== "undefined" ? `${window.location.origin}/escrow-pay/${escrow.public_id}` : "";
  const [copied, setCopied] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState(escrow.milestones[0]?.evidence_url ?? "");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = escrow.milestones.find((item) => item.status !== "RELEASED") ?? escrow.milestones[escrow.milestones.length - 1];
  const runProviderAction = async (action: "evidence" | "release") => {
    if (!getAccessToken || !organizationWallet || !escrow.chain_escrow_id || !current) return;
    const signer = wallets.find((wallet) => wallet.address.toLowerCase() === organizationWallet.toLowerCase()) ?? wallets.find((wallet) => wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2") ?? wallets[0];
    if (!signer) { setError("Connect the organization wallet to approve this provider action."); return; }
    setBusy(true); setError(null);
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Your Privy session expired. Sign in again.");
      await signer.switchChain(arcChainId);
      const provider = await signer.getEthereumProvider();
      const evidenceHash = keccak256(toHex(evidenceUrl.trim()));
      const data = action === "evidence" ? encodeFunctionData({ abi: escrowV2Abi as any, functionName: "submitMilestoneEvidence", args: [BigInt(escrow.chain_escrow_id), BigInt(current.milestone_index), evidenceHash] }) : encodeFunctionData({ abi: escrowV2Abi as any, functionName: "releaseMilestone", args: [BigInt(escrow.chain_escrow_id)] });
      const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: signer.address, to: escrowV2Address, data }] }) as `0x${string}`;
      const receipt = await arcPublicClient.waitForTransactionReceipt({ hash }); if (receipt.status !== "success") throw new Error("Arc rejected this provider action.");
      const response = await fetch(`${apiUrl}/v1/escrows/${escrow.id}/actions`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, milestoneIndex: current.milestone_index, transactionHash: hash, ...(action === "evidence" ? { evidenceHash, evidenceUrl: evidenceUrl.trim(), evidenceDescription: evidenceDescription.trim() || undefined } : {}) }) });
      const body = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) throw new Error(body?.error ?? "The action could not be recorded.");
      await onUpdated();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Provider action failed."); } finally { setBusy(false); }
  };
  const copyPaymentLink = async () => { if (!paymentUrl) return; await navigator.clipboard?.writeText(paymentUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const payerApproved = (current?.payer_approval_count ?? 0) >= (escrow.required_payer_approvals ?? 1);
  return <div className="escrow-drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="escrow-drawer" role="dialog" aria-modal="true" aria-labelledby="escrow-detail-title"><div className="escrow-drawer-header"><div><span className="eyebrow">Care funding plan</span><h2 id="escrow-detail-title">{escrow.treatment_name}</h2><p>{escrow.patient_reference}</p></div><button type="button" className="icon-button" aria-label="Close care plan details" onClick={onClose}><X size={19} /></button></div><div className="escrow-drawer-summary"><div><span>Released</span><strong>{released.toFixed(2)} USDC</strong></div><div><span>Protected</span><strong>{Math.max(total - released, 0).toFixed(2)} USDC</strong></div><div><span>Status</span><StatusBadge value={escrow.status} /></div></div>{paymentUrl && <section className="escrow-drawer-link"><div><span className="eyebrow">Funding link</span><p>Share this link with the payer to fund the care plan.</p></div><div className="escrow-drawer-link-row"><input readOnly aria-label="Care plan funding link" value={paymentUrl} /><button type="button" className="icon-button" aria-label="Copy care plan funding link" title="Copy funding link" onClick={() => void copyPaymentLink()}>{copied ? <Check size={15} /> : <Copy size={15} />}</button><a className="icon-button" aria-label="Open care plan funding link" title="Open funding link" href={paymentUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a></div></section>}<section className="escrow-drawer-section"><div className="section-title"><div><h3>Milestones</h3><p>Care delivery and financial release.</p></div></div><div className="escrow-drawer-milestones">{escrow.milestones.map((milestone) => <div className="escrow-drawer-milestone" key={milestone.milestone_index}><span className={`milestone-dot ${milestone.status.toLowerCase()}`} /> <div><strong>{milestone.label}</strong><small>{(Number(milestone.amount_minor) / 1_000_000).toFixed(2)} USDC · {milestone.status === "EVIDENCE_SUBMITTED" ? "Evidence submitted — Awaiting payer" : milestone.status}{milestone.evidence_url && milestone.status !== "EVIDENCE_SUBMITTED" ? " · Evidence submitted" : ""}{milestone.evidence_description ? ` — ${milestone.evidence_description}` : ""}</small></div></div>)}</div></section>{current && escrow.status === "FUNDED" && <section className="escrow-drawer-section"><div className="section-title"><div><h3>Provider action</h3><p>{current.evidence_hash && !payerApproved ? "Evidence submitted. Waiting for the payer to review and approve before you can release." : "Submit proof, then release this milestone after required payer approvals."}</p></div></div>{!current.evidence_hash && <><input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="Evidence URL or secure record reference" /><textarea value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} placeholder="Describe what was done in this session (e.g., 'Completed kidney function blood panel — results attached above')" rows={3} className="evidence-description-textarea" /></>}<div className="modal-actions">{!current.evidence_hash && <button type="button" className="button button-secondary" disabled={busy || !evidenceUrl.trim()} onClick={() => void runProviderAction("evidence")}>Submit evidence</button>}<button type="button" className="button button-primary" disabled={busy || !current.evidence_hash || !payerApproved} onClick={() => void runProviderAction("release")}>{!current.evidence_hash ? "Release milestone" : !payerApproved ? "Awaiting payer approval..." : "Release milestone"}</button></div></section>}{error && <div className="form-error" role="alert"><AlertCircle size={16} /> {error}</div>}<div className="escrow-drawer-footer"><span className="mono">{escrow.payment_reference ?? "Care funding request"}</span><button type="button" className="button button-secondary" onClick={onClose}>Close details</button></div></aside></div>;
}

function CreateEscrowModal({ organizationId, organizationWallet, getAccessToken, onClose, onCreated }: { organizationId: string; organizationWallet: string; getAccessToken: () => Promise<string | null>; onClose: () => void; onCreated: (paymentUrl?: string) => void }) {
  const { wallets: connectedWallets } = useWallets();
  const [patient, setPatient] = useState("");
  const [treatment, setTreatment] = useState("");
  const [policy, setPolicy] = useState("provider_only");
  const [payerWallets, setPayerWallets] = useState("");
  const [requiredPayerApprovals, setRequiredPayerApprovals] = useState("1");
  const [milestones, setMilestones] = useState([{ label: "Session 1", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const token = await getAccessToken(); if (!token) throw new Error("Your Privy session expired. Sign in again.");
      const payerList = payerWallets.split(/[\s,]+/).map((wallet) => wallet.trim()).filter(Boolean);
      let chainEscrowId: string | undefined;
      let createTransactionHash: string | undefined;
      if (escrowV2Address) {
        const signer = connectedWallets.find((wallet) => wallet.address.toLowerCase() === organizationWallet.toLowerCase()) ?? connectedWallets.find((wallet) => wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2") ?? connectedWallets[0];
        if (!signer) throw new Error("Connect the organization wallet before creating this care plan.");
        await signer.switchChain(arcChainId);
        const provider = await signer.getEthereumProvider();
        const amounts = milestones.map((item) => parseUnits(item.amount, 6));
        const hash = await provider.request({ method: "eth_sendTransaction", params: [{ from: signer.address, to: escrowV2Address, data: encodeFunctionData({ abi: escrowV2Abi as any, functionName: "createEscrow", args: [organizationWallet as Address, payerList as Address[], payerList.length === 0, policy === "provider_and_patient" ? Number(requiredPayerApprovals) : 0, amounts] }) }] }) as `0x${string}`;
        const receipt = await arcPublicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Arc rejected the care-plan creation transaction.");
        for (const log of receipt.logs) { try { const decoded = decodeEventLog({ abi: escrowV2Abi as any, data: log.data, topics: log.topics }) as { eventName?: string; args?: { escrowId?: bigint } }; if (decoded.eventName === "EscrowCreated" && decoded.args?.escrowId !== undefined) chainEscrowId = String(decoded.args.escrowId); } catch { /* unrelated event */ } }
        if (!chainEscrowId) throw new Error("The care plan was created but its onchain ID could not be confirmed.");
        createTransactionHash = hash;
      }
      const response = await fetch(`${apiUrl}/v1/organizations/${organizationId}/escrows`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ patientReference: patient, treatmentName: treatment, approvalPolicy: policy, payerWallets: payerList, openFunding: payerList.length === 0, requiredPayerApprovals: policy === "provider_and_patient" ? Number(requiredPayerApprovals) : 0, chainEscrowId, createTransactionHash, milestones: milestones.map((item) => ({ label: item.label, amountUsdc: item.amount })) }) });
      const body = await response.json().catch(() => null) as { escrow?: ApiEscrow; error?: string } | null;
      if (!response.ok || !body?.escrow) throw new Error(body?.error ?? "Escrow could not be created.");
      onCreated(body.escrow.public_id ? `/escrow-pay/${body.escrow.public_id}` : undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Escrow setup failed."); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true"><div className="modal-header"><div><p>Create care funding plan</p><h2>Generate treatment request</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit}><div className="form-grid"><label><span>Patient reference</span><input required value={patient} onChange={(event) => setPatient(event.target.value)} placeholder="PAT-2048" /></label><label><span>Treatment name</span><input required value={treatment} onChange={(event) => setTreatment(event.target.value)} placeholder="Kidney surgery tests" /></label><label className="full-field"><span>Approved payer wallets</span><input value={payerWallets} onChange={(event) => setPayerWallets(event.target.value)} placeholder="0x... 0x... (optional; separated by spaces)" /><small>Only these wallets can contribute to this care plan. Leave empty to assign the payer when the link is opened.</small></label><label><span>Milestone approval</span><select value={policy} onChange={(event) => setPolicy(event.target.value)}><option value="provider_only">Provider evidence only</option><option value="provider_and_patient">Provider evidence + payer confirmation</option></select></label>{policy === "provider_and_patient" && <label><span>Payer confirmations required</span><input type="number" min="1" value={requiredPayerApprovals} onChange={(event) => setRequiredPayerApprovals(event.target.value)} /></label>}</div><div className="milestone-editor"><div className="section-title"><div><h3>Care milestones</h3><p>Each amount unlocks only after evidence is submitted and approved.</p></div><button type="button" className="button button-secondary" onClick={() => setMilestones((items) => [...items, { label: `Session ${items.length + 1}`, amount: "" }])}><Plus size={15} /> Add</button></div>{milestones.map((item, index) => <div className="milestone-input" key={index}><input aria-label={`Milestone ${index + 1} label`} value={item.label} onChange={(event) => setMilestones((items) => items.map((current, i) => i === index ? { ...current, label: event.target.value } : current))} /><input aria-label={`Milestone ${index + 1} amount`} type="number" min="0.000001" step="0.000001" required value={item.amount} onChange={(event) => setMilestones((items) => items.map((current, i) => i === index ? { ...current, amount: event.target.value } : current))} placeholder="1.00 USDC" /></div>)}</div>{error && <div className="form-error" role="alert"><AlertCircle size={16} /> {error}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? "Creating request..." : "Create care funding request"}</button></div></form></section></div>;
}

function CareRail() {
  return <div className="care-rail">{milestones.map((milestone, index) => <div className={`rail-step ${milestone.state}`} key={milestone.label}><div className="rail-track"><span>{milestone.state === "complete" ? <Check size={14} /> : index + 1}</span>{index < milestones.length - 1 && <i />}</div><strong>{milestone.label}</strong><small>{milestone.detail}</small></div>)}</div>;
}

function MiniCareRail() {
  return <div className="mini-rail">{[1, 2, 3, 4, 5, 6, 7, 8].map((item) => <div className={item < 6 ? "done" : item === 6 ? "current" : ""} key={item}><span>{item < 6 ? <Check size={11} /> : item}</span>{item < 8 && <i />}</div>)}</div>;
}

function PatientsView({ live }: { live: boolean }) {
  if (live) return <LiveEmpty title="No patient references yet" description="Patient references are created alongside provider invoices. Medical records remain offchain." />;
  const patients = [{ id: "PAT-2048", treatment: "Kidney dialysis", balance: "700 USDC locked", status: "Active" }, { id: "PAT-7210", treatment: "Cardiac screening", balance: "Paid in full", status: "Complete" }, { id: "PAT-8812", treatment: "Ultrasound", balance: "20 USDC due", status: "Attention" }];
  return <section className="panel data-panel"><TableToolbar placeholder="Search patient references" /><div className="patient-list">{patients.map((patient) => <button className="patient-row" key={patient.id}><span className="patient-avatar">{patient.id.slice(-2)}</span><span><strong>{patient.id}</strong><small>{patient.treatment}</small></span><span><strong>{patient.balance}</strong><small>Financial status</small></span><StatusBadge value={patient.status} /><ArrowUpRight size={16} /></button>)}</div></section>;
}

function ReportsView({ live }: { live: boolean }) {
  const download = (name: string, rows: string) => { const url = URL.createObjectURL(new Blob([rows], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url); };
  return <div className="two-column-grid"><section className="panel report-card"><span className="report-icon"><FileText size={21} /></span><h2>Payment reconciliation</h2><p>{live ? "Export becomes available after the first verified payment." : "Invoices, blockchain transactions, exceptions, and settlement totals."}</p><button className="button button-secondary" onClick={() => download("usdcare-payment-reconciliation.csv", "payment_id,invoice_id,status,amount\n")}><ArrowDownToLine size={16} /> Export CSV</button></section><section className="panel report-card"><span className="report-icon green"><ClipboardList size={21} /></span><h2>Escrow activity</h2><p>{live ? "Export becomes available after the first treatment escrow." : "Funding, releases, refunds, approvals, and locked balances."}</p><button className="button button-secondary" onClick={() => download("usdcare-escrow-activity.csv", "escrow_id,status,funded,released,remaining\n")}><ArrowDownToLine size={16} /> Export CSV</button></section></div>;
}

function LiveEmpty({ title, description }: { title: string; description: string }) {
  return <section className="panel empty-state-panel live-empty"><div className="empty-workspace-icon"><Activity size={23} /></div><div><h2>{title}</h2><p>{description}</p></div></section>;
}

function HelpView() {
  return <div className="content-stack"><section className="panel empty-workspace-panel"><div className="empty-workspace-icon"><HelpCircle size={24} /></div><div><h2>How USDCare works</h2><p>Create a provider invoice, share its payment link, verify the USDC transaction, and issue a receipt. Organization accounts can later add treatment escrow and milestone releases.</p></div></section><section className="panel settings-panel"><div className="settings-detail-row"><span>Need to connect a wallet?</span><strong>Open Settings → Wallets</strong></div><div className="settings-detail-row"><span>Need to sign out?</span><strong>Open Settings → Security</strong></div></section></div>;
}

type SettingsSection = "wallets" | "account" | "team" | "security" | "notifications";

function SettingsView({ email, wallets, organization, onConnectWallet, demo }: { email: string; wallets: WalletSummary[]; organization?: OrganizationSummary; onConnectWallet: () => void; demo: boolean }) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("wallets");
  const sections: Array<{ id: SettingsSection; label: string }> = [
    { id: "wallets", label: "Wallets" },
    { id: "account", label: organization ? "Organization" : "Account" },
    { id: "team", label: "Team and roles" },
    { id: "security", label: "Security" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div className="settings-layout">
      <aside className="settings-nav" aria-label="Settings sections">
        {sections.map((section) => (
          <button key={section.id} className={activeSection === section.id ? "active" : ""} onClick={() => setActiveSection(section.id)}>{section.label}</button>
        ))}
      </aside>
      <div className="settings-content">
        {activeSection === "wallets" && (
          <>
            <section className="panel settings-panel">
              <div className="section-title"><div><h2>Wallets</h2><p>{organization ? "Your primary organization wallet approves actions and receives payments." : "Wallets linked to your personal USDCare account."}</p></div><button className="button button-secondary" onClick={onConnectWallet}><Link2 size={16} /> Connect wallet</button></div>
              <div className="settings-email"><span>Signed in with Privy</span><strong>{email}</strong></div>
              {wallets.map((wallet, index) => <div className="settings-wallet" key={wallet.address}><span className="wallet-icon"><WalletCards size={19} /></span><div className="wallet-address-copy"><strong>{wallet.label}</strong><p className="mono">{wallet.address}</p><small>Arc Testnet</small></div><div className="wallet-role-tags"><span>{index === 0 ? "Primary" : "Connected"}</span>{wallet.verified && <span>Verified</span>}</div><CopyAddressButton address={wallet.address} label={`Copy ${wallet.label} address`} /></div>)}
            </section>
            <WalletBalance />
          </>
        )}
        {activeSection === "account" && (
          <section className="panel settings-panel">
            <div className="section-title"><div><h2>{organization ? "Organization" : "Personal account"}</h2><p>{organization ? "Workspace identity and verification status." : "Your individual USDCare workspace."}</p></div></div>
            <div className="settings-detail-row"><span>Account email</span><strong>{email}</strong></div>
            <div className="settings-detail-row"><span>Workspace type</span><strong>{organization ? organization.type.replaceAll("_", " ") : "Individual"}</strong></div>
            {organization && <><div className="settings-detail-row"><span>Organization</span><strong>{organization.name}</strong></div><div className="settings-detail-row"><span>Verification</span><strong className="capitalize">{organization.verificationStatus}</strong></div></>}
          </section>
        )}
        {activeSection === "team" && (
          <section className="panel settings-panel">
            <div className="section-title"><div><h2>Team and roles</h2><p>{organization ? "People authorized to work in this organization." : "Personal workspaces do not have team members."}</p></div></div>
            <div className="settings-member"><span className="avatar-small">{email.slice(0, 1).toUpperCase()}</span><div><strong>{email}</strong><p>{organization ? "Administrator" : "Account owner"}</p></div><span className="status success">Active</span></div>
            {!organization && <div className="settings-note">Create or join an organization workspace to invite finance, clinical, and administrative staff.</div>}
          </section>
        )}
        {activeSection === "security" && (
          <section className="panel settings-panel">
            <div className="section-title"><div><h2>Security</h2><p>Authentication, wallet recovery, and account access are handled by Privy.</p></div></div>
            <div className="security-setting"><ShieldCheck size={19} /><div><strong>Email authentication</strong><p>Signed in as {email}</p></div><span className="status success">Verified</span></div>
            <div className="security-setting"><WalletCards size={19} /><div><strong>Wallet recovery</strong><p>Managed through your Privy identity. USDCare never stores your recovery phrase.</p></div></div>
          </section>
        )}
        {activeSection === "notifications" && (
          <section className="panel settings-panel">
            <div className="section-title"><div><h2>Notifications</h2><p>Payment and escrow notifications will be delivered to your verified email.</p></div></div>
            <div className="settings-detail-row"><span>Delivery address</span><strong>{email}</strong></div>
            <div className="settings-note">Email notification preferences will be configurable when live payment monitoring is enabled.</div>
          </section>
        )}
      </div>
    </div>
  );
}

function WalletBalance() {
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find((wallet) => wallet.walletClientType === "privy" || wallet.walletClientType === "privy-v2");
  const [balance, setBalance] = useState<bigint | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = async () => {
    if (!embeddedWallet) return;
    setError(null);
    try {
      setBalance(await arcPublicClient.getBalance({ address: embeddedWallet.address as Address }));
    } catch {
      setError("Arc balance could not be loaded.");
    }
  };

  useEffect(() => {
    void refreshBalance();
  }, [embeddedWallet?.address]);

  return <section className="panel wallet-balance-panel"><div><h2>Wallet balance</h2><p>Arc Testnet balance available for account transactions.</p></div><strong className="mono">{balance === null ? "Checking..." : `${Number(formatEther(balance)).toFixed(4)} USDC`}</strong><button className="text-button" disabled={!embeddedWallet} onClick={() => void refreshBalance()}>Refresh balance</button>{error && <span className="form-error" role="alert">{error}</span>}</section>;
}

function CopyAddressButton({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(address);
    } else {
      const input = document.createElement("textarea");
      input.value = address;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return <button className="icon-button copy-address-button" type="button" aria-label={label} title={copied ? "Copied" : label} onClick={() => void copyAddress()}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>;
}

function TableToolbar({ placeholder, action, query = "", onQueryChange, filter = "all", onFilterChange }: { placeholder: string; action?: React.ReactNode; query?: string; onQueryChange?: (value: string) => void; filter?: "all" | "pending" | "complete"; onFilterChange?: (value: "all" | "pending" | "complete") => void }) {
  return <div className="table-toolbar"><label><Search size={16} /><input placeholder={placeholder} value={query} onChange={(event) => onQueryChange?.(event.target.value)} /></label><div className="toolbar-actions"><div className="segmented-small">{(["all", "pending", "complete"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => onFilterChange?.(value)}>{value.slice(0, 1).toUpperCase() + value.slice(1)}</button>)}</div>{action}</div></div>;
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const type = normalized.includes("paid") || normalized.includes("confirm") || normalized.includes("complete") || normalized === "active" ? "success" : normalized.includes("review") || normalized.includes("partial") || normalized.includes("attention") ? "warning" : normalized.includes("expired") ? "neutral" : "info";
  return <span className={`status ${type}`}>{type === "success" && <Check size={12} />}{type === "warning" && <AlertCircle size={12} />}{value}</span>;
}

function CreateInvoiceModal({ organizationName, onClose, onCreate }: { organizationName: string; onClose: () => void; onCreate: (invoice: { patient: string; service: string; amount: string }) => Promise<void> }) {
  const [patient, setPatient] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("Direct payment");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!patient || !service || !amount) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onCreate({ patient, service, amount });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Payment request could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><div className="modal-header"><div><p>Patient payment</p><h2 id="invoice-title">New care payment request</h2></div><button className="icon-button" aria-label="Close" onClick={onClose}><X size={19} /></button></div><form onSubmit={handleSubmit}><div className="form-grid"><label><span>Patient reference</span><input value={patient} onChange={(event) => setPatient(event.target.value)} placeholder="PAT-2048" required /></label><label><span>Care service</span><input value={service} onChange={(event) => setService(event.target.value)} placeholder="MRI scan" required /></label><label className="amount-input"><span>Amount due</span><div><input type="number" min="0.000001" step="0.000001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><strong>USDC</strong></div></label><label><span>Payment route</span><select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}><option>Pay provider now</option><option disabled>Milestone care plan</option></select></label><label className="full-field"><span>Care team note</span><textarea placeholder="Visible only to authorized staff" /></label></div><div className="invoice-preview"><span>Provider settlement</span><strong>{organizationName}</strong><small>Funds route to the verified organization wallet</small></div>{submitError && <div className="form-error" role="alert"><AlertCircle size={17} /> {submitError}</div>}<div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={submitting}>{submitting ? "Creating..." : "Create care payment"}</button></div></form></section></div>;
}

function CarePreview() {
  return <section className="auth-preview"><div className="preview-header"><div><span className="status success"><Check size={12} /> Funds secured</span><h2>Kidney dialysis</h2><p>12 sessions · 1,200 USDC</p></div><Activity size={22} /></div><div className="preview-balance"><span>Still protected</span><strong className="mono">700.00 <small>USDC</small></strong></div><MiniCareRail /><div className="preview-event"><span><Check size={15} /></span><div><strong>Session 5 released</strong><p>100 USDC sent to Lakeside Dialysis Centre</p></div><small>Verified</small></div></section>;
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><HeartPulse size={19} /></span><strong>USDCare</strong></div>;
}

function shortAddress(address?: string) {
  if (!address) return "Not connected";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
