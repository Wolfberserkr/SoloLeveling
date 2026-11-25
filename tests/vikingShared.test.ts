import { it, expect } from 'vitest';
import * as shared from '../supabase/functions/_shared/viking/logic';
import * as app from '@/features/viking/vikingLogic';

it('app and Deno share one copy of the rules', () => { expect(app.viking).toBe(shared.viking); });
