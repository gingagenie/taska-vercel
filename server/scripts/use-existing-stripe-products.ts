import Stripe from 'stripe';
import { db } from '../db/client';
import { subscriptionPlans } from '../../shared/schema';
import { eq } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY required');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

async function useExistingProducts() {
  console.log('Finding existing Stripe products...\n');

  // Find Taska Solo
  const soloProducts = await stripe.products.search({ query: 'name:"Taska Solo"' });
  const soloProduct = soloProducts.data.find(p => p.active);
  
  // Find Taska Professional (your existing Pro)
  const proProducts = await stripe.products.search({ query: 'name:"Taska Professional"' });
  const proProduct = proProducts.data.find(p => p.active);
  
  // Find Taska Enterprise
  const enterpriseProducts = await stripe.products.search({ query: 'name:"Taska Enterprise"' });
  const enterpriseProduct = enterpriseProducts.data.find(p => p.active);

  if (soloProduct) {
    const prices = await stripe.prices.list({ product: soloProduct.id, active: true, currency: 'aud' });
    const price = prices.data.find(p => p.recurring?.interval === 'month');
    if (price) {
      console.log(`✅ Solo: ${price.id} ($${(price.unit_amount! / 100)})`);
      await db.update(subscriptionPlans).set({ stripePriceId: price.id }).where(eq(subscriptionPlans.id, 'solo'));
    }
  }

  if (proProduct) {
    const prices = await stripe.prices.list({ product: proProduct.id, active: true, currency: 'aud' });
    const price = prices.data.find(p => p.recurring?.interval === 'month');
    if (price) {
      console.log(`✅ Pro: ${price.id} ($${(price.unit_amount! / 100)})`);
      await db.update(subscriptionPlans).set({ stripePriceId: price.id }).where(eq(subscriptionPlans.id, 'pro'));
    }
  }

  if (enterpriseProduct) {
    const prices = await stripe.prices.list({ product: enterpriseProduct.id, active: true, currency: 'aud' });
    const price = prices.data.find(p => p.recurring?.interval === 'month');
    if (price) {
      console.log(`✅ Enterprise: ${price.id} ($${(price.unit_amount! / 100)})`);
      await db.update(subscriptionPlans).set({ stripePriceId: price.id }).where(eq(subscriptionPlans.id, 'enterprise'));
    }
  }

  console.log('\n✅ Database updated with existing product price IDs');
}

useExistingProducts().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
