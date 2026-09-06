/**
 * audioCache.js — shared in-memory MP3 cache.
 *
 * Keyed by `${callSid}_greeting`, `${callSid}_turn_N`, `${callSid}_closing`.
 * Shared between the Twilio webhook routes (single calls) and the campaign
 * call worker (mass calls) so pre-generated greeting audio is always served.
 */
module.exports = new Map();
