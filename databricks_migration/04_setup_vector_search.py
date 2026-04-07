#!/usr/bin/env python3
"""
Set up Mosaic AI Vector Search for all embedding columns
Migrates from pgvector to Databricks Vector Search
"""

import os
from databricks.vector_search.client import VectorSearchClient
from databricks import sql
from dotenv import load_dotenv

load_dotenv()

# Tables with vector embeddings
VECTOR_TABLES = [
    {
        'table': 'streaming_graph_vertices',
        'vector_column': 'embedding',
        'dimension': 384,
        'primary_key': 'vertex_id',
        'columns': ['vertex_id', 'vertex_type', 'properties', 'risk_score', 'labels']
    },
    {
        'table': 'code_pattern_analysis',
        'vector_column': 'embedding',
        'dimension': 1536,
        'primary_key': 'id',
        'columns': ['id', 'code_snippet', 'vulnerability_patterns_detected', 'confidence_score']
    },
    {
        'table': 'dark_web_intelligence',
        'vector_column': 'embedding',
        'dimension': 1536,
        'primary_key': 'id',
        'columns': ['id', 'source', 'content_snippet', 'threat_level', 'indicators_extracted']
    },
    {
        'table': 'ioc_embeddings',
        'vector_column': 'embedding',
        'dimension': 1536,
        'primary_key': 'ioc_id',
        'columns': ['ioc_id', 'indicator', 'indicator_type', 'threat_level', 'confidence_score']
    }
]

ENDPOINT_NAME = "siem_vector_search"

def create_vector_search_endpoint(vsc):
    """Create Vector Search endpoint (one-time)"""
    print("🎯 Creating Vector Search endpoint...\n")

    try:
        endpoint = vsc.get_endpoint(ENDPOINT_NAME)
        print(f"   ✅ Endpoint already exists: {ENDPOINT_NAME}\n")
        return endpoint
    except:
        print(f"   Creating new endpoint: {ENDPOINT_NAME}")
        endpoint = vsc.create_endpoint(
            name=ENDPOINT_NAME,
            endpoint_type="STANDARD"
        )
        print(f"   ✅ Endpoint created: {ENDPOINT_NAME}\n")
        return endpoint

def create_vector_index(vsc, config):
    """Create vector search index for a table"""
    table_name = config['table']
    index_name = f"siem.{table_name}_vector_index"

    print(f"📊 Creating vector index for {table_name}...")
    print(f"   Dimension: {config['dimension']}")
    print(f"   Primary key: {config['primary_key']}")
    print(f"   Vector column: {config['vector_column']}")

    try:
        # Check if index exists
        existing = vsc.get_index(index_name)
        print(f"   ⚠️  Index already exists, recreating...\n")
        vsc.delete_index(index_name)
    except:
        pass

    # Create index
    index = vsc.create_delta_sync_index(
        endpoint_name=ENDPOINT_NAME,
        index_name=index_name,
        source_table_name=f"siem.{table_name}",
        pipeline_type="CONTINUOUS",  # Auto-sync on table changes
        primary_key=config['primary_key'],
        embedding_dimension=config['dimension'],
        embedding_vector_column=config['vector_column']
    )

    print(f"   ✅ Index created: {index_name}\n")
    return index

def generate_query_examples(config):
    """Generate example queries for each vector index"""
    table_name = config['table']
    index_name = f"siem.{table_name}_vector_index"

    examples = f'''
-- ============================================================
-- Vector Search Examples for {table_name}
-- ============================================================

-- Python: Similarity search
from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

# Search by vector
query_vector = [0.1, 0.2, ...]  # {config['dimension']}-dimensional vector
results = vsc.similarity_search(
    index_name="{index_name}",
    query_vector=query_vector,
    columns={config['columns']},
    num_results=10
)

for result in results.get('result', {{}).get('data_array', []):
    print(result)

# Search by text (if using embedding model)
from databricks.ai import embed

query_text = "ransomware attack"
query_vector = embed(query_text, model="gte-small")

results = vsc.similarity_search(
    index_name="{index_name}",
    query_vector=query_vector.tolist(),
    columns={config['columns']},
    num_results=10
)

-- SQL: Approximate nearest neighbor (if supported)
SELECT
    {", ".join(config['columns'][:3])},
    VECTOR_COSINE_DISTANCE({config['vector_column']}, array({', '.join(['?' for _ in range(config['dimension'])])})) as similarity
FROM siem.{table_name}
ORDER BY similarity ASC
LIMIT 10;
'''

    return examples

def test_vector_search(vsc, config):
    """Test vector search with sample query"""
    table_name = config['table']
    index_name = f"siem.{table_name}_vector_index"

    print(f"🧪 Testing vector search on {table_name}...")

    try:
        # Create dummy query vector
        query_vector = [0.1] * config['dimension']

        # Search
        results = vsc.similarity_search(
            index_name=index_name,
            query_vector=query_vector,
            columns=config['columns'],
            num_results=5
        )

        num_results = len(results.get('result', {}).get('data_array', []))
        print(f"   ✅ Test successful, found {num_results} results\n")

        return True
    except Exception as e:
        print(f"   ❌ Test failed: {e}\n")
        return False

def main():
    """Main execution"""
    print("🚀 Setting up Mosaic AI Vector Search\n")

    # Initialize Vector Search client
    print("📊 Connecting to Databricks Vector Search...")
    vsc = VectorSearchClient(
        workspace_url=os.getenv('DATABRICKS_HOST'),
        personal_access_token=os.getenv('DATABRICKS_TOKEN')
    )
    print("✅ Connected!\n")

    # Create endpoint
    create_vector_search_endpoint(vsc)

    # Create indexes
    print(f"📋 Creating {len(VECTOR_TABLES)} vector indexes...\n")

    successful = []
    failed = []

    for i, config in enumerate(VECTOR_TABLES, 1):
        print(f"[{i}/{len(VECTOR_TABLES)}] {config['table']}")

        try:
            # Create index
            create_vector_index(vsc, config)

            # Wait for index to be ready
            import time
            print("   ⏳ Waiting for index to sync...")
            time.sleep(10)

            # Test index
            if test_vector_search(vsc, config):
                successful.append(config['table'])
            else:
                failed.append(config['table'])

        except Exception as e:
            print(f"   ❌ Error: {e}\n")
            failed.append(config['table'])

    # Generate query examples
    print("📝 Generating query examples...")
    examples_dir = "databricks_migration/examples"
    os.makedirs(examples_dir, exist_ok=True)

    all_examples = "# Vector Search Query Examples\n\n"
    for config in VECTOR_TABLES:
        all_examples += generate_query_examples(config)
        all_examples += "\n"

    with open(f"{examples_dir}/vector_search_examples.py", 'w') as f:
        f.write(all_examples)

    print(f"   ✅ Saved to: {examples_dir}/vector_search_examples.py\n")

    # Summary
    print("="*60)
    print("📊 VECTOR SEARCH SETUP SUMMARY")
    print("="*60)
    print(f"✅ Successful: {len(successful)}/{len(VECTOR_TABLES)} indexes")
    print(f"❌ Failed: {len(failed)}/{len(VECTOR_TABLES)} indexes")

    if successful:
        print("\n✅ Successful indexes:")
        for table in successful:
            print(f"   - {table}")

    if failed:
        print("\n❌ Failed indexes:")
        for table in failed:
            print(f"   - {table}")

    print("\n✨ Vector search setup complete!")
    print("\n🎯 Next steps:")
    print("1. Review vector_search_examples.py")
    print("2. Test similarity searches in application")
    print("3. Monitor index sync performance")
    print("4. Adjust num_results based on use case")

if __name__ == "__main__":
    main()
