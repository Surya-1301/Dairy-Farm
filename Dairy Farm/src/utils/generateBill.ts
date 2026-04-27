type Customer = {
  id: string;
  name: string;
  liters: number;
  rate: number;
};

export function generateBill(customers: Customer[]) {
  const totalCustomers = customers.length;
  const totalLiters = customers.reduce((sum, customer) => sum + customer.liters, 0);
  const totalAmount = customers.reduce(
    (sum, customer) => sum + customer.liters * customer.rate,
    0
  );

  return {
    totalCustomers,
    totalLiters,
    totalAmount
  };
}
