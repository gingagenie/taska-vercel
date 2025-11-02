import Stripe from 'stripe';
import { db } from '../db/client';
import { subscriptionPlans } from '../../shared/schema';
import { eq } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

const PLANS = [
  {
    id: 'solo',
    name: 'Taska Solo',
    priceAud: 2900,
    description: 'Solo plan - 1 user, 100 SMS, 100 emails per month',
  },
  {
    id: 'pro',
    name: 'Taska Pro',
    priceAud: 4900,
    description: 'Pro plan - 5 users, 500 SMS, 500 emails per month',
  },
  {
    id: 'enterprise',
    name: 'Taska Enterprise',
    priceAud: 9900,
    description: 'Enterprise plan - 12 users, 2000 SMS, 2000 emails per month',
  },
];

async function setupStripeAudPrices() {
  console.log('========================================');
  console.log('Setting up Stripe AUD Prices for Taska');
  console.log('========================================\n');

  for (const plan of PLANS) {
    console.log(`\n📦 Processing: ${plan.name} (${plan.id})`);
    console.log(`   Price: $${(plan.priceAud / 100).toFixed(2)} AUD`);

    try {
      let product: Stripe.Product | undefined;

      console.log('   🔍 Searching for existing Stripe product...');
      const products = await stripe.products.search({
        query: `name:"${plan.name}"`,
      });

      if (products.data.length > 0) {
        product = products.data[0];
        console.log(`   ✅ Found existing product: ${product.id}`);
      } else {
        console.log('   📝 Creating new Stripe product...');
        product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: {
            plan_id: plan.id,
          },
        });
        console.log(`   ✅ Created product: ${product.id}`);
      }

      console.log('   🔍 Checking for existing AUD price...');
      const existingPrices = await stripe.prices.list({
        product: product.id,
        active: true,
        currency: 'aud',
      });

      let price: Stripe.Price | undefined;

      if (existingPrices.data.length > 0) {
        const matchingPrice = existingPrices.data.find(
          (p) => p.unit_amount === plan.priceAud && p.recurring?.interval === 'month'
        );

        if (matchingPrice) {
          price = matchingPrice;
          console.log(`   ✅ Found existing AUD price: ${price.id}`);
        } else {
          console.log('   📝 Creating new AUD price (no matching price found)...');
          price = await stripe.prices.create({
            product: product.id,
            currency: 'aud',
            unit_amount: plan.priceAud,
            recurring: {
              interval: 'month',
            },
            metadata: {
              plan_id: plan.id,
            },
          });
          console.log(`   ✅ Created AUD price: ${price.id}`);
        }
      } else {
        console.log('   📝 Creating new AUD price...');
        price = await stripe.prices.create({
          product: product.id,
          currency: 'aud',
          unit_amount: plan.priceAud,
          recurring: {
            interval: 'month',
          },
          metadata: {
            plan_id: plan.id,
          },
        });
        console.log(`   ✅ Created AUD price: ${price.id}`);
      }

      console.log('   💾 Updating database with stripe_price_id...');
      await db
        .update(subscriptionPlans)
        .set({ stripePriceId: price.id })
        .where(eq(subscriptionPlans.id, plan.id));

      console.log(`   ✅ Database updated for ${plan.id}`);
      console.log(`   📋 Price ID: ${price.id}`);
      console.log(`   💰 Amount: $${(price.unit_amount! / 100).toFixed(2)} ${price.currency.toUpperCase()}`);
    } catch (error: any) {
      console.error(`   ❌ ERROR processing ${plan.id}:`, error.message);
      throw error;
    }
  }

  console.log('\n========================================');
  console.log('✅ All Stripe AUD prices set up successfully!');
  console.log('========================================\n');

  console.log('📊 Summary:');
  const dbPlans = await db.select().from(subscriptionPlans);
  for (const dbPlan of dbPlans.filter((p) => ['solo', 'pro', 'enterprise'].includes(p.id))) {
    console.log(`   ${dbPlan.id}: ${dbPlan.stripePriceId || 'NOT SET'}`);
  }

  console.log('\n✅ Setup complete! The checkout flow will now use these fixed AUD Price IDs.');
}

setupStripeAudPrices()
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });
