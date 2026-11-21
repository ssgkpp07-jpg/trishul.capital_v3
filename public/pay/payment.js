export function createPaymentLinks({ pa, pn, am, tn }) {
  const params = new URLSearchParams({ pa, pn, am, cu: 'INR', tn });
  return {
    googlePay: `intent://pay?${params.toString()}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`,
    otherUpi: `upi://pay?${params.toString()}`
  };
}
