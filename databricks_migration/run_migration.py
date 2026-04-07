#!/usr/bin/env python3
"""
Master Orchestration Script - Complete Databricks Migration
Runs all migration steps in correct order
"""

import os
import sys
import time
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

MIGRATION_STEPS = [
    {
        'step': 1,
        'name': 'Generate Schema (Delta Lake DDL)',
        'script': '01_generate_schema.py',
        'description': 'Auto-generate Delta Lake schema from Supabase PostgreSQL',
        'estimated_time': '5 minutes',
        'required': True
    },
    {
        'step': 2,
        'name': 'Create Tables in Databricks',
        'script': 'manual',
        'description': 'Run generated SQL in Databricks SQL Editor',
        'instructions': [
            'Open Databricks SQL Editor',
            'Run: databricks_migration/generated_sql/01_create_tables.sql',
            'Verify all 203 tables created successfully'
        ],
        'estimated_time': '10 minutes',
        'required': True
    },
    {
        'step': 3,
        'name': 'Migrate Data (203 tables)',
        'script': '02_migrate_data.py',
        'description': 'Copy all data from Supabase to Delta Lake',
        'estimated_time': '30-60 minutes (depends on data size)',
        'required': True
    },
    {
        'step': 4,
        'name': 'Optimize Tables',
        'script': 'manual',
        'description': 'Run OPTIMIZE and Z-ORDER on all tables',
        'instructions': [
            'Run: databricks_migration/generated_sql/02_optimize_tables.sql',
            'This improves query performance 10-100x'
        ],
        'estimated_time': '15 minutes',
        'required': True
    },
    {
        'step': 5,
        'name': 'Convert Triggers & Functions',
        'script': '03_convert_triggers_functions.py',
        'description': 'Create UDFs and trigger replacements',
        'estimated_time': '5 minutes',
        'required': True
    },
    {
        'step': 6,
        'name': 'Set up Vector Search',
        'script': '04_setup_vector_search.py',
        'description': 'Create Mosaic AI vector indexes for embeddings',
        'estimated_time': '10 minutes',
        'required': False  # Optional if not using vector search
    },
    {
        'step': 7,
        'name': 'Migrate CEP Patterns',
        'script': '05_migrate_cep_patterns.py',
        'description': 'Set up Delta Live Tables for threat detection',
        'estimated_time': '5 minutes',
        'required': False  # Optional if not using CEP
    },
    {
        'step': 8,
        'name': 'Apply Row-Level Security',
        'script': 'manual',
        'description': 'Create Unity Catalog row filters',
        'instructions': [
            'Run: databricks_migration/generated_sql/03_row_level_security.sql',
            'Test RLS with different user accounts'
        ],
        'estimated_time': '10 minutes',
        'required': True
    },
    {
        'step': 9,
        'name': 'Verify Migration',
        'script': 'manual',
        'description': 'Validate data integrity and query performance',
        'instructions': [
            'Compare row counts (Supabase vs Databricks)',
            'Test sample queries from application',
            'Verify UDFs work correctly',
            'Test vector search (if enabled)',
            'Test CEP patterns (if enabled)'
        ],
        'estimated_time': '30 minutes',
        'required': True
    },
    {
        'step': 10,
        'name': 'Update Application Code',
        'script': 'manual',
        'description': 'Replace Supabase client with Databricks client',
        'instructions': [
            'Update 48 component files to use Databricks SQL',
            'Replace real-time subscriptions with polling',
            'Test all application features',
            'Deploy updated application'
        ],
        'estimated_time': '2-3 days',
        'required': True
    }
]

def print_banner():
    """Print migration banner"""
    print("\n" + "="*70)
    print(" " * 15 + "DATABRICKS MIGRATION ORCHESTRATOR")
    print("="*70)
    print(f"Start Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*70 + "\n")

def check_prerequisites():
    """Check if all required environment variables are set"""
    print("🔍 Checking prerequisites...\n")

    required_vars = [
        'SUPABASE_DB_HOST',
        'SUPABASE_DB_PASSWORD',
        'DATABRICKS_HOST',
        'DATABRICKS_TOKEN',
        'DATABRICKS_HTTP_PATH'
    ]

    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
            print(f"   ❌ Missing: {var}")
        else:
            # Mask sensitive values
            value = os.getenv(var)
            if 'PASSWORD' in var or 'TOKEN' in var:
                masked = value[:4] + '...' + value[-4:] if len(value) > 8 else '***'
                print(f"   ✅ {var}: {masked}")
            else:
                print(f"   ✅ {var}: {value}")

    if missing:
        print(f"\n❌ Missing required environment variables: {', '.join(missing)}")
        print("\nPlease set these in your .env file:")
        for var in missing:
            print(f"   {var}=your_value_here")
        return False

    print("\n✅ All prerequisites met!\n")
    return True

def run_python_script(script_path):
    """Execute a Python migration script"""
    print(f"   🚀 Running: {script_path}")
    start_time = time.time()

    try:
        # Import and run the script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        full_path = os.path.join(script_dir, script_path)

        # Execute script
        exec(open(full_path).read(), {'__name__': '__main__'})

        elapsed = time.time() - start_time
        print(f"   ✅ Completed in {elapsed/60:.1f} minutes\n")
        return True

    except Exception as e:
        elapsed = time.time() - start_time
        print(f"   ❌ Failed after {elapsed/60:.1f} minutes")
        print(f"   Error: {e}\n")
        return False

def display_manual_step(step):
    """Display instructions for manual steps"""
    print(f"\n⚠️  MANUAL STEP REQUIRED")
    print(f"Description: {step['description']}")

    if 'instructions' in step:
        print("\nInstructions:")
        for i, instruction in enumerate(step['instructions'], 1):
            print(f"   {i}. {instruction}")

    print(f"\n⏱️  Estimated time: {step['estimated_time']}")

    input("\nPress ENTER when you've completed this step...")
    print("✅ Marked as complete\n")

def run_migration_step(step):
    """Execute a single migration step"""
    print(f"{'='*70}")
    print(f"STEP {step['step']}: {step['name']}")
    print(f"{'='*70}")
    print(f"Description: {step['description']}")
    print(f"Estimated time: {step['estimated_time']}")
    print(f"Required: {'Yes' if step['required'] else 'Optional'}")
    print()

    # Ask if user wants to run optional steps
    if not step['required']:
        response = input("This step is optional. Run it? (y/n): ")
        if response.lower() != 'y':
            print("⏭️  Skipped\n")
            return True

    # Run automated script or display manual instructions
    if step['script'] == 'manual':
        display_manual_step(step)
        return True
    else:
        return run_python_script(step['script'])

def generate_migration_report(results):
    """Generate final migration report"""
    print("\n" + "="*70)
    print(" " * 20 + "MIGRATION REPORT")
    print("="*70 + "\n")

    total = len(results)
    completed = sum(1 for r in results if r['status'] == 'completed')
    skipped = sum(1 for r in results if r['status'] == 'skipped')
    failed = sum(1 for r in results if r['status'] == 'failed')

    print(f"Total Steps: {total}")
    print(f"✅ Completed: {completed}")
    print(f"⏭️  Skipped: {skipped}")
    print(f"❌ Failed: {failed}\n")

    if failed > 0:
        print("❌ Failed Steps:")
        for result in results:
            if result['status'] == 'failed':
                print(f"   - Step {result['step']}: {result['name']}")
        print("\nPlease fix errors and re-run failed steps.\n")
    else:
        print("🎉 All steps completed successfully!\n")

    print("="*70 + "\n")

def main():
    """Main orchestration"""
    print_banner()

    # Check prerequisites
    if not check_prerequisites():
        sys.exit(1)

    # Confirm start
    print("📋 Migration Plan:")
    print(f"   • {len(MIGRATION_STEPS)} total steps")
    required_steps = sum(1 for s in MIGRATION_STEPS if s['required'])
    print(f"   • {required_steps} required steps")
    print(f"   • {len(MIGRATION_STEPS) - required_steps} optional steps")

    total_time = sum(
        int(s['estimated_time'].split('-')[0].split()[0])
        for s in MIGRATION_STEPS
        if s['required']
    )
    print(f"   • ~{total_time} minutes estimated (required steps only)\n")

    response = input("Ready to start migration? (yes/no): ")
    if response.lower() != 'yes':
        print("\n❌ Migration cancelled\n")
        sys.exit(0)

    # Run migration steps
    results = []
    start_time = time.time()

    for step in MIGRATION_STEPS:
        result = {
            'step': step['step'],
            'name': step['name'],
            'status': 'pending'
        }

        try:
            success = run_migration_step(step)
            if success:
                result['status'] = 'completed'
            else:
                result['status'] = 'failed'

                # Ask if user wants to continue
                response = input("\n⚠️  Step failed. Continue anyway? (y/n): ")
                if response.lower() != 'y':
                    print("\n❌ Migration aborted\n")
                    break

        except KeyboardInterrupt:
            print("\n\n⚠️  Migration interrupted by user\n")
            result['status'] = 'interrupted'
            break
        except Exception as e:
            print(f"\n❌ Unexpected error: {e}\n")
            result['status'] = 'failed'

        results.append(result)

    # Generate report
    elapsed = time.time() - start_time
    print(f"\n⏱️  Total time: {elapsed/60:.1f} minutes")

    generate_migration_report(results)

    # Next steps
    if all(r['status'] == 'completed' for r in results if MIGRATION_STEPS[r['step']-1]['required']):
        print("🎯 Next Steps:")
        print("1. Test all application features thoroughly")
        print("2. Run load tests (1000+ QPS)")
        print("3. Train team on new Databricks features")
        print("4. Monitor performance for 1 week")
        print("5. Decommission Supabase after validation")
        print("\n✨ Migration complete! Good luck! 🚀\n")

if __name__ == "__main__":
    main()
