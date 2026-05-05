// mishoras – client-side helpers

// Auto-dismiss alerts after 5 s
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.alert.alert-success').forEach(function (el) {
    setTimeout(function () {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(el);
      bsAlert.close();
    }, 5000);
  });
});
