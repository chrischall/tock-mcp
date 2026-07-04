import { describe, it, expect } from 'vitest';
import { createTestHarness } from '@chrischall/mcp-utils/test';
import { registerDiscoverTools } from '../src/tools/discover.js';
import { registerRestaurantTools } from '../src/tools/restaurants.js';
import { registerAccountTools } from '../src/tools/account.js';
import { stubClient } from './helpers.js';

// The exact tool roster (excluding the bridge healthcheck, which needs a live
// transport). server-boot.test.ts asserts the healthcheck is present in the
// built artifact.
const EXPECTED = [
  'tock_list_metros',
  'tock_search_restaurants',
  'tock_get_restaurant',
  'tock_get_availability',
  'tock_list_reservations',
  'tock_get_profile',
];

describe('tool roster', () => {
  it('registers exactly the expected data tools', async () => {
    const client = stubClient({});
    const h = await createTestHarness((s) => {
      registerDiscoverTools(s, client);
      registerRestaurantTools(s, client);
      registerAccountTools(s, client);
    });
    const names = (await h.listTools()).map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED].sort());
    await h.close();
  });
});
