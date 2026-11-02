import os
os.environ.setdefault("NORTHSTAR_WARMUP", "0")  # no background warm-up during tests

import pytest

from northstar.data.loader import load_network


@pytest.fixture(scope="session")
def network():
    return load_network()
