import Stripe from 'stripe';
import { db } from '../db/client';
import { subscriptionPlans, orgSubscriptions, organizations } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('ERROR: STRIPE_SECRET_KEY environment variable is required');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

async function migrateSubscriptionsToAud() {
  console.log('========================================');
  console.log('Migrating Active Subscriptions to AUD Prices');
  console.log('========================================\n');

  const activeSubscriptions = await db
    .select({
      sub: orgSubscriptions,
      plan: subscriptionPlans,
      org: organizations,
    })
    .from(orgSubscriptions)
    .leftJoin(subscriptionPlans, eq(orgSubscriptions.planId, subscriptionPlans.id))
    .leftJoin(organizations, eq(orgSubscriptions.orgId, organizations.id))
    .where(
      and(
        eq(orgSubscriptions.status, 'active'),
      )
    );

  console.log(`Found ${activeSubscriptions.length} active subscriptions\n`);

  if (activeSubscriptions.length === 0) {
    console.log('✅ No active subscriptions to migrate');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (const { sub, plan, org } of activeSubscriptions) {
    if (!sub.stripeSubscriptionId) {
      console.log(`⏭️  Skipping org ${org?.name || sub.orgId} - no Stripe subscription ID`);
      continue;
    }

    if (!plan || !plan.stripePriceId) {
      console.error(`❌ Skipping org ${org?.name || sub.orgId} - plan ${sub.planId} missing AUD price ID`);
      console.error(`   Run: npm run setup:stripe-prices first!`);
      errorCount++;
      continue;
    }

    try {
      console.log(`\n📦 Processing: ${org?.name || sub.orgId}`);
      console.log(`   Plan: ${plan.name} (${sub.planId})`);
      console.log(`   Stripe Subscription: ${sub.stripeSubscriptionId}`);

      const stripeSubscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      const currentPrice = stripeSubscription.items.data[0]?.price;

      if (!currentPrice) {
        console.error(`   ❌ No price found on Stripe subscription`);
        errorCount++;
        continue;
      }

      console.log(`   Current Price: ${currentPrice.id} (${currentPrice.currency.toUpperCase()}: $${(currentPrice.unit_amount! / 100).toFixed(2)})`);
      console.log(`   Target Price: ${plan.stripePriceId} (AUD: $${(plan.priceMonthly / 100).toFixed(2)})`);

      if (currentPrice.id === plan.stripePriceId) {
        console.log(`   ✅ Already using correct AUD price - no action needed`);
        successCount++;
        continue;
      }

      if (currentPrice.currency === 'aud' && currentPrice.unit_amount === plan.priceMonthly) {
        console.log(`   ℹ️  Already using AUD with correct amount (different price ID)`);
        console.log(`   Updating to standard price ID: ${plan.stripePriceId}`);
      } else {
        console.log(`   ⚠️  Currency mismatch detected - migrating to AUD!`);
      }

      console.log(`   🔄 Updating subscription to use AUD price...`);

      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [
          {
            id: stripeSubscription.items.data[0].id,
            price: plan.stripePriceId,
          },
        ],
        proration_behavior: 'none',
      });

      const updatedSubscription = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
      const newPrice = updatedSubscription.items.data[0].price;

      console.log(`   ✅ Migration successful!`);
      console.log(`   New Price: ${newPrice.id} (${newPrice.currency.toUpperCase()}: $${(newPrice.unit_amount! / 100).toFixed(2)})`);
      
      const nextBilling = updatedSubscription.current_period_end 
        ? new Date(updatedSubscription.current_period_end * 1000).toLocaleDateString()
        : 'Unknown';
      console.log(`   Next billing: ${nextBilling}`);

      successCount++;
    } catch (error: any) {
      console.error(`   ❌ Error migrating subscription:`, error.message);
      errorCount++;
    }
  }

  console.log('\n========================================');
  console.log('Migration Summary');
  console.log('========================================');
  console.log(`✅ Successfully migrated: ${successCount}`);
  console.log(`❌ Failed: ${errorCount}`);
  console.log(`Total processed: ${activeSubscriptions.length}`);
  console.log('========================================\n');

  if (errorCount > 0) {
    console.error('⚠️  Some subscriptions failed to migrate. Please review the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All active subscriptions are now using AUD prices!');
  }
}

migrateSubscriptionsToAud()
  .then(() => {
    console.log('\n✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration script failed:', error);
    process.exit(1);
  });
