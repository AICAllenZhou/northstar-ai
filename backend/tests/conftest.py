import pytest

from northstar.data.loader import load_network


@pytest.fixture(scope="session")
def network():
    return load_network()
