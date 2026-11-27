#!/usr/bin/env perl
use strict;
use warnings;
use Cwd qw(abs_path);
use File::Spec;
use FindBin qw($RealBin);
use IO::Socket::INET;

my $port = shift @ARGV // 8765;
my $root = abs_path(shift @ARGV // $RealBin);
die "Cannot resolve application directory.\n" unless defined $root;
die "Port must be an integer between 1024 and 65535.\n" unless $port =~ /^\d+$/ && $port >= 1024 && $port <= 65535;

my %mime = (
  html => 'text/html; charset=utf-8', htm => 'text/html; charset=utf-8',
  css => 'text/css; charset=utf-8', js => 'text/javascript; charset=utf-8',
  mjs => 'text/javascript; charset=utf-8', json => 'application/json; charset=utf-8',
  webmanifest => 'application/manifest+json; charset=utf-8', wasm => 'application/wasm',
  svg => 'image/svg+xml', png => 'image/png', jpg => 'image/jpeg', jpeg => 'image/jpeg',
  webp => 'image/webp', pdf => 'application/pdf', txt => 'text/plain; charset=utf-8',
  woff2 => 'font/woff2', wav => 'audio/wav', mp3 => 'audio/mpeg', ogg => 'audio/ogg',
  opus => 'audio/ogg', m4a => 'audio/mp4', aac => 'audio/aac',
);

my $server = IO::Socket::INET->new(
  LocalAddr => '127.0.0.1',
  LocalPort => $port,
  Proto => 'tcp',
  Listen => 16,
  ReuseAddr => 1,
) or die "Cannot start local server on 127.0.0.1:$port: $!\n";
$SIG{PIPE} = 'IGNORE';
print "Local offline app server listening on http://127.0.0.1:$port/\n";

sub respond {
  my ($client, $status, $reason, $content_type, $file, $body, $is_head) = @_;
  my $length = defined($file) ? -s $file : length($body // '');
  $length = 0 unless defined $length;
  print {$client} "HTTP/1.1 $status $reason\r\n",
    "Content-Type: $content_type\r\n",
    "Content-Length: $length\r\n",
    "Cache-Control: no-cache\r\n",
    "X-Content-Type-Options: nosniff\r\n",
    "Connection: close\r\n\r\n" or return;
  return if $is_head;

  if (defined $file) {
    open my $asset, '<:raw', $file or return;
    my $buffer;
    while (read($asset, $buffer, 64 * 1024)) {
      last unless print {$client} $buffer;
    }
    close $asset;
  } elsif (defined $body && length $body) {
    print {$client} $body;
  }
}

sub handle_client {
  my ($client) = @_;
  eval {
    my $request = <$client>;
    if (!defined $request || length($request) > 8192) {
      respond($client, 400, 'Bad Request', 'text/plain; charset=utf-8', undef, 'Bad Request', 0);
      return;
    }
    my ($method, $target) = $request =~ /^(\S+)\s+(\S+)\s+HTTP\/\d\.\d\s*\r?\n?$/;
    if (!defined $method || !defined $target) {
      respond($client, 400, 'Bad Request', 'text/plain; charset=utf-8', undef, 'Bad Request', 0);
      return;
    }
    my $is_head = uc($method) eq 'HEAD';
    if (uc($method) ne 'GET' && !$is_head) {
      respond($client, 405, 'Method Not Allowed', 'text/plain; charset=utf-8', undef, 'Method Not Allowed', 0);
      return;
    }

    my $header_bytes = 0;
    while (my $header = <$client>) {
      $header_bytes += length $header;
      last if $header =~ /^\r?\n$/ || $header_bytes > 32768;
    }

    my ($path) = split /\?/, $target, 2;
    if (!defined $path || $path !~ m{^/} || $path =~ /%(?![0-9a-fA-F]{2})/) {
      respond($client, 400, 'Bad Request', 'text/plain; charset=utf-8', undef, 'Bad Request', $is_head);
      return;
    }
    $path =~ s/%([0-9a-fA-F]{2})/chr(hex($1))/eg;
    if ($path =~ /[\x00\\]/) {
      respond($client, 404, 'Not Found', 'text/plain; charset=utf-8', undef, 'Not Found', $is_head);
      return;
    }
    $path =~ s{^/+}{};
    $path = 'index.html' if $path eq '';
    my @parts = grep { length } split m{/+}, $path;
    if (!@parts || grep { $_ eq '.' || $_ eq '..' } @parts) {
      respond($client, 404, 'Not Found', 'text/plain; charset=utf-8', undef, 'Not Found', $is_head);
      return;
    }

    my $candidate = File::Spec->catfile($root, @parts);
    my $file = abs_path($candidate);
    my $relative = defined($file) ? File::Spec->abs2rel($file, $root) : '';
    if (!defined($file) || !-f $file || $relative eq File::Spec->updir() || $relative =~ /^\.\.(?:[\\\/]|$)/) {
      respond($client, 404, 'Not Found', 'text/plain; charset=utf-8', undef, 'Not Found', $is_head);
      return;
    }

    my ($extension) = $file =~ /\.([^.\/\\]+)$/;
    my $content_type = defined($extension) ? ($mime{lc $extension} // 'application/octet-stream') : 'application/octet-stream';
    respond($client, 200, 'OK', $content_type, $file, undef, $is_head);
  };
}

while (my $client = $server->accept()) {
  $client->autoflush(1);
  handle_client($client);
  close $client;
}
