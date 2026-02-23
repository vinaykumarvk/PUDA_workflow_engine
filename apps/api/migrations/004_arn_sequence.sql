-- Migration 004: Add ARN sequence for collision-safe ARN generation
CREATE SEQUENCE IF NOT EXISTS arn_seq START 10001;
