import { PublicPaymentRequest } from "@/components/public-payment-request";

export default async function PaymentPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <PublicPaymentRequest publicId={publicId} />;
}
