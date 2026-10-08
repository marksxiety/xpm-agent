import pm2 from "pm2";

pm2.connect((connectError) => {
  if (connectError) {
    console.error(connectError);
    process.exit(1);
  }
  pm2.disconnect();
  process.exit(0);
});
