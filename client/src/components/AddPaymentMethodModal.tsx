/**
 * Add Payment Method Modal
 * Wraps the payment form in a Stripe Elements provider and dialog
 */

import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AddPaymentMethodForm } from './AddPaymentMethodForm';

// Initialize Stripe with publishable key
const stripePromise = loadStripe(
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
    'pk_test_51StfTYGTmTf8xrp4fdcTd3kEzfxgkvClWxtEv1dgi5ec1nIRv3DT2QmX2N4815F3DvnTYYQVKdnAPmKgG7loF2je00KmDLK25Q',
);

interface AddPaymentMethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddPaymentMethodModal({ open, onOpenChange, onSuccess }: AddPaymentMethodModalProps) {
  const handleSuccess = () => {
    onSuccess?.();
    setTimeout(() => {
      onOpenChange(false);
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Payment Setup</DialogTitle>
        </DialogHeader>
        <Elements stripe={stripePromise}>
          <AddPaymentMethodForm onSuccess={handleSuccess} onCancel={() => onOpenChange(false)} />
        </Elements>
      </DialogContent>
    </Dialog>
  );
}
