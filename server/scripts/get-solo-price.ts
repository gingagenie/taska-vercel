import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-08-27.basil' });

async function getSolo() {
  const products = await stripe.products.list({ limit: 20 });
  const solo = products.data.find(p => p.name.includes('Solo'));
  if (solo) {
    console.log(`Found: ${solo.name} (${solo.id}) - Active: ${solo.active}`);
    const prices = await stripe.prices.list({ product: solo.id, active: true });
    prices.data.forEach(p => {
      console.log(`  Price: ${p.id} - ${p.currency.toUpperCase()} $${(p.unit_amount!/100)} - Recurring: ${p.recurring?.interval}`);
    });
  }
}
getSolo();
