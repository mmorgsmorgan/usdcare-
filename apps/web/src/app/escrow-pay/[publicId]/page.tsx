import { PublicEscrowPaymentRequest } from "@/components/public-escrow-payment-request";

export default async function EscrowPaymentPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PublicEscrowPaymentRequest publicId={publicId} />;
}
