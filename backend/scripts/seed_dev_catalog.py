from sqlalchemy import select

from app.core.config import get_settings
from app.db.models import Account, Business
from app.db.session import SessionLocal
from app.domain.catalog import customers, providers
from app.domain.catalog.errors import DuplicateCustomerName, DuplicateProviderName

PROVIDERS_BY_BUSINESS = {
    "merceria": (
        {"name": "Distribuidora Norte", "contact_name": "Juan Pérez", "phone": "011-4555-1122"},
        {"name": "Textiles del Sur", "contact_name": "Marta Gómez", "phone": "011-4555-3344"},
        {"name": "Hilanderías Reunidas", "contact_name": None, "phone": None},
    ),
    "despensa": (
        {"name": "Almacén Mayorista Centro", "contact_name": "Roberto Sosa", "phone": "011-4555-5566"},
        {"name": "Distribuidora de Bebidas del Oeste", "contact_name": None, "phone": "011-4555-7788"},
    ),
}

CUSTOMERS_BY_BUSINESS = {
    "merceria": (
        {"name": "Ana Gómez", "phone": "15-2233-4455", "address": "Av. Rivadavia 1234"},
        {"name": "Beto Ruiz", "phone": None, "address": None},
        {"name": "Carla Díaz", "phone": "15-6677-8899", "address": "Calle Falsa 123"},
    ),
    "despensa": (
        {"name": "Elena Torres", "phone": "15-1122-3344", "address": "San Martín 456"},
        {"name": "Miguel Álvarez", "phone": None, "address": None},
    ),
}


def main() -> None:
    settings = get_settings()
    db = SessionLocal()
    try:
        businesses = {
            "merceria": db.scalars(
                select(Business).where(Business.name == settings.initial_business_name)
            ).first(),
            "despensa": db.scalars(
                select(Business).where(Business.name == settings.initial_business_2_name)
            ).first(),
        }

        actor = db.scalars(select(Account).where(Account.user_name == "due")).first()
        if actor is None:
            print("No existe la cuenta 'due'; corré primero seed_dev_accounts.py")
            return

        for business_key, provider_list in PROVIDERS_BY_BUSINESS.items():
            business = businesses.get(business_key)
            if business is None:
                print(f"Saltando proveedores de '{business_key}': no existe el negocio")
                continue
            for provider_data in provider_list:
                try:
                    providers.create_provider(db, business.id, provider_data["name"], actor.id, **{
                        key: value for key, value in provider_data.items() if key != "name"
                    })
                    print(f"Creado proveedor '{provider_data['name']}' en {business.name}")
                except DuplicateProviderName:
                    print(f"Ya existe el proveedor '{provider_data['name']}', se omite")

        for business_key, customer_list in CUSTOMERS_BY_BUSINESS.items():
            business = businesses.get(business_key)
            if business is None:
                print(f"Saltando clientes de '{business_key}': no existe el negocio")
                continue
            for customer_data in customer_list:
                try:
                    customers.create_customer(db, business.id, customer_data["name"], actor.id, **{
                        key: value for key, value in customer_data.items() if key != "name"
                    })
                    print(f"Creado cliente '{customer_data['name']}' en {business.name}")
                except DuplicateCustomerName:
                    print(f"Ya existe el cliente '{customer_data['name']}', se omite")
    finally:
        db.close()


if __name__ == "__main__":
    main()
