import { createClient } from "@supabase/supabase-js";

// The anon/public key is safe to ship in client code by design - Supabase
// access control happens server-side via Row Level Security policies (see
// supabase-schema.sql), not by keeping this key secret.
const SUPABASE_URL = "https://vvutplnhayvawwmencdb.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2dXRwbG5oYXl2YXd3bWVuY2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NjMxMTAsImV4cCI6MjEwMTMzOTExMH0.On84QWb-TQFHRZ-nlawv2WBFkzoji6xGGMHRwx1gd0c";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
